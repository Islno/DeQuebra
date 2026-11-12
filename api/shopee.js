const crypto = require("crypto");

const SUPABASE_URL = "https://opohtwavqvtfykfgzkmx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wb2h0d2F2cXZ0ZnlrZmd6a214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNTk0MTksImV4cCI6MjEwODkzNTQxOX0.Tklm_2VpnDjVzPqUiEeN8j41X0ug4zet34fJCvODsI0";

const SHOPEE_APP_ID = (process.env.SHOPEE_APP_ID || "").trim();
const SHOPEE_SECRET = (process.env.SHOPEE_SECRET || "").trim();

// Palavras proibidas (bloqueia brinquedos, decoração, infantil, etc.)
const PALAVRAS_BLOQUEADAS = [
  "brinquedo", "boneco", "boneca", "miniatura", "action figure", "funko",
  "infantil", "bebe", "bebê", "crianca", "criança", "kids", "menino", "menina",
  "adesivo", "poster", "pôster", "quadro", "placa", "caneca", "copo", "garrafa",
  "chaveiro", "capinha", "pelicula", "película", "celular", "livro", "revista",
  "cd ", "dvd", "vinil", "disco", "fantasia", "cosplay", "pet", "cachorro", "gato",
  "fingerboard", "skate de dedo", "pelucia", "pelúcia", "almofada", "tapete", "toalha"
];

// Palavras obrigatórias (garante que é roupa ou acessório de vestir)
const PALAVRAS_VESTUARIO = [
  "camiseta", "camisa", "blusa", "t-shirt", "tshirt", "oversized", "regata", "peita",
  "calca", "calça", "bermuda", "short", "jeans", "cargo", "baggy", "jogger", "sarja",
  "moletom", "jaqueta", "casaco", "hoodie", "corta vento", "puffer", "sueter", "colete",
  "bone", "boné", "gorro", "touca", "bucket", "five panel", "snapback", "aba reta",
  "corrente", "colar", "pulseira", "anel", "brinco", "pingente", "grumet", "inox", "prata",
  "oculos", "óculos", "relogio", "relógio", "shoulder bag", "bolsa", "pochete", "mochila",
  "meia", "tenis", "tênis", "chinelo", "cinto", "carteira"
];

function ehRoupaOuAcessorioValido(titulo) {
  const t = (titulo || "").toLowerCase();
  if (PALAVRAS_BLOQUEADAS.some(b => t.includes(b))) return false;
  return PALAVRAS_VESTUARIO.some(v => t.includes(v));
}

async function shopeeGraphQL(query) {
  if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
    throw new Error("Configure SHOPEE_APP_ID e SHOPEE_SECRET nas Environment Variables da Vercel.");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ query });
  const signature = crypto
    .createHash("sha256")
    .update(`${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_SECRET}`)
    .digest("hex");

  const res = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
    },
    body: payload
  });

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || "Erro na API da Shopee");
  }
  return json.data;
}

module.exports = async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const isCron = req.headers["x-vercel-cron"] === "1";

    if (!isCron) {
      if (!token) return res.status(401).json({ error: "Faça login como Admin primeiro." });
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` }
      });
      if (!userRes.ok) return res.status(401).json({ error: "Sessão expirada. Saia e entre novamente no Admin." });
    }

    const authToken = isCron ? (process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY) : token;

    async function sbRest(path, options = {}) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
          ...(options.headers || {})
        }
      });
      const text = await r.text();
      const data = text ? JSON.parse(text) : null;
      if (!r.ok) throw new Error(data?.message || data?.error || `Erro Supabase (${r.status})`);
      return data;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = req.query?.action || body.action;

    // 1. CONVERTER LINK INDIVIDUAL
    if (action === "convert_link") {
      const q = `mutation {
        generateShortLink(input: { originUrl: ${JSON.stringify(body.url)}, subIds: ["DeQuebra"] }) {
          shortLink
        }
      }`;
      const data = await shopeeGraphQL(q);
      return res.status(200).json({ shortLink: data?.generateShortLink?.shortLink });
    }

    // 2. IMPORTAR 1 LOTE POR VEZ (MODO GOTA-A-GOTA SEM TRAVAR A SHOPEE)
    if (action === "import_step") {
      const kw = (body.kw || "camiseta racionais").trim();
      const catNome = (body.cat || "Camisetas Street").trim();
      const page = parseInt(body.page, 10) || 1;
      const limit = parseInt(body.limit, 10) || 6;

      const catsAtuais = (await sbRest("categorias?select=*")) || [];
      let catObj = catsAtuais.find(c => c.nome.toLowerCase() === catNome.toLowerCase());
      if (!catObj) {
        const nova = await sbRest("categorias", {
          method: "POST",
          body: JSON.stringify({ nome: catNome })
        });
        catObj = nova?.[0];
      }

      const prodsAtuais = (await sbRest("produtos?select=nome")) || [];
      const nomesExistentes = new Set(prodsAtuais.map(p => (p.nome || "").toLowerCase()));

      // Faz APENAS UMA chamada limpa à Shopee para nunca dar erro 10000
      const q = `query {
        productOfferV2(keyword: ${JSON.stringify(kw)}, page: ${page}, limit: ${limit}) {
          nodes { itemId productName priceMin imageUrl offerLink sales ratingStar }
        }
      }`;

      const data = await shopeeGraphQL(q);
      const nodes = data?.productOfferV2?.nodes || [];
      const novosProdutos = [];
      const agora = new Date().toISOString();

      for (const item of nodes) {
        const nomeLimpo = (item.productName || "").trim().slice(0, 90);
        if (!nomeLimpo) continue;
        if (nomesExistentes.has(nomeLimpo.toLowerCase())) continue;

        // Passa pelo filtro anti-brinquedo / só roupas e acessórios
        if (!ehRoupaOuAcessorioValido(nomeLimpo)) continue;

        nomesExistentes.add(nomeLimpo.toLowerCase());
        novosProdutos.push({
          nome: nomeLimpo,
          categoria_id: catObj?.id,
          preco: parseFloat(item.priceMin) || null,
          link: item.offerLink,
          descricao: `⭐ ${item.ratingStar || "4.9"} | 🔥 +${item.sales || 50} vendidos [REF:${item.itemId}]`,
          foto_url: item.imageUrl,
          atualizado_em: agora,
          preco_atualizado_em: agora
        });
      }

      if (novosProdutos.length > 0) {
        await sbRest("produtos", {
          method: "POST",
          body: JSON.stringify(novosProdutos)
        });
      }

      return res.status(200).json({
        ok: true,
        kw,
        adicionados: novosProdutos.length,
        analisados: nodes.length
      });
    }

    // 3. ATUALIZAR PREÇO DE POUCO EM POUCO (PEGA OS 3 PRODUTOS HÁ MAIS TEMPO SEM VERIFICAR)
    if (action === "sync_prices") {
      const produtos = (await sbRest("produtos?select=*&order=preco_atualizado_em.asc.nullsfirst&limit=3")) || [];
      let atualizados = 0;

      for (const prod of produtos) {
        try {
          const palavras = (prod.nome || "").split(" ").slice(0, 3).join(" ");
          const q = `query {
            productOfferV2(keyword: ${JSON.stringify(palavras)}, page: 1, limit: 1) {
              nodes { priceMin }
            }
          }`;
          const data = await shopeeGraphQL(q);
          const info = data?.productOfferV2?.nodes?.[0];
          const agora = new Date().toISOString();

          if (info && info.priceMin) {
            const novoPreco = parseFloat(info.priceMin);
            const precoAntigo = parseFloat(prod.preco);
            const mudou = !isNaN(novoPreco) && novoPreco !== precoAntigo;
            if (mudou) atualizados++;

            await sbRest(`produtos?id=eq.${prod.id}`, {
              method: "PATCH",
              body: JSON.stringify(
                mudou
                  ? { preco: novoPreco, preco_atualizado_em: agora, atualizado_em: agora }
                  : { preco_atualizado_em: agora }
              )
            });
          } else {
            await sbRest(`produtos?id=eq.${prod.id}`, {
              method: "PATCH",
              body: JSON.stringify({ preco_atualizado_em: agora })
            });
          }
        } catch (e) {}
      }

      return res.status(200).json({ ok: true, verificados: produtos.length, atualizados });
    }

    return res.status(400).json({ error: "Ação inválida" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};