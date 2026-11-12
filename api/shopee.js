const crypto = require("crypto");

const SUPABASE_URL = "https://opohtwavqvtfykfgzkmx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wb2h0d2F2cXZ0ZnlrZmd6a214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNTk0MTksImV4cCI6MjEwODkzNTQxOX0.Tklm_2VpnDjVzPqUiEeN8j41X0ug4zet34fJCvODsI0";

const SHOPEE_APP_ID = (process.env.SHOPEE_APP_ID || "").trim();
const SHOPEE_SECRET = (process.env.SHOPEE_SECRET || "").trim();

// Lista expandida de termos CURTOS (2 a 3 palavras) que retornam centenas de peças na Shopee
const GRADE_STREETWEAR_GOTICO = [
  // Camisetas Góticas, Grunge, Dark & Street
  { kw: "camiseta gotica", cat: "Gótico & Darkwear" },
  { kw: "camiseta dark", cat: "Gótico & Darkwear" },
  { kw: "camiseta grunge", cat: "Gótico & Darkwear" },
  { kw: "camiseta esqueleto", cat: "Gótico & Darkwear" },
  { kw: "camiseta caveira", cat: "Gótico & Darkwear" },
  { kw: "camiseta cruz", cat: "Gótico & Darkwear" },
  { kw: "camiseta tribal", cat: "Gótico & Darkwear" },
  { kw: "camiseta punk rock", cat: "Gótico & Darkwear" },
  { kw: "camiseta aranha", cat: "Gótico & Darkwear" },
  { kw: "camiseta anjo", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta y2k", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta gato", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta oversized preta", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta estonada", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta streetwear", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta racionais", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta sabotage", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta tupac", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta rap", cat: "Camisetas Street & Y2K" },
  { kw: "camiseta manga longa listrada", cat: "Gótico & Darkwear" },

  // Calças Balão, Baggy, Cargo & Góticas
  { kw: "calca balao", cat: "Calças Baggy & Balão" },
  { kw: "calca baggy", cat: "Calças Baggy & Balão" },
  { kw: "calca jeans larga", cat: "Calças Baggy & Balão" },
  { kw: "calca cargo preta", cat: "Calças Baggy & Balão" },
  { kw: "calca cargo grafite", cat: "Calças Baggy & Balão" },
  { kw: "calca moletom larga", cat: "Calças Baggy & Balão" },
  { kw: "calca carpinteiro", cat: "Calças Baggy & Balão" },
  { kw: "calca gotica", cat: "Gótico & Darkwear" },
  { kw: "calca paraquedas", cat: "Calças Baggy & Balão" },
  { kw: "calca estonada", cat: "Calças Baggy & Balão" },

  // Bermudas Jorts & Conjuntos Street
  { kw: "bermuda jorts", cat: "Bermudas Jorts & Baggy" },
  { kw: "bermuda baggy", cat: "Bermudas Jorts & Baggy" },
  { kw: "bermuda jeans larga", cat: "Bermudas Jorts & Baggy" },
  { kw: "bermuda cargo preta", cat: "Bermudas Jorts & Baggy" },
  { kw: "conjunto streetwear", cat: "Bermudas Jorts & Baggy" },

  // Moletons Góticos, Tribal & Casacos Pesados
  { kw: "moletom gotico", cat: "Moletons Dark & Tribal" },
  { kw: "moletom tribal", cat: "Moletons Dark & Tribal" },
  { kw: "moletom ziper preto", cat: "Moletons Dark & Tribal" },
  { kw: "moletom y2k", cat: "Moletons Dark & Tribal" },
  { kw: "moletom esqueleto", cat: "Moletons Dark & Tribal" },
  { kw: "moletom oversized", cat: "Moletons Dark & Tribal" },
  { kw: "moletom canguru preto", cat: "Moletons Dark & Tribal" },
  { kw: "jaqueta corta vento preta", cat: "Moletons Dark & Tribal" },
  { kw: "jaqueta puffer preta", cat: "Moletons Dark & Tribal" },

  // Acessórios Góticos & Streetwear
  { kw: "colar gotico cruz", cat: "Acessórios Góticos & Street" },
  { kw: "anel caveira inox", cat: "Acessórios Góticos & Street" },
  { kw: "anel gotico", cat: "Acessórios Góticos & Street" },
  { kw: "corrente grumet inox", cat: "Acessórios Góticos & Street" },
  { kw: "cinto rebites gotico", cat: "Acessórios Góticos & Street" },
  { kw: "pulseira couro spikes", cat: "Acessórios Góticos & Street" },
  { kw: "gorro beanie preto", cat: "Acessórios Góticos & Street" },
  { kw: "bone five panel", cat: "Acessórios Góticos & Street" },
  { kw: "oculos y2k", cat: "Acessórios Góticos & Street" },
  { kw: "shoulder bag preta", cat: "Acessórios Góticos & Street" }
];

// Bloqueia brinquedos, decoração, infantil e roupas sociais/fitness fora do estilo
const PALAVRAS_BLOQUEADAS = [
  "brinquedo", "boneco", "boneca", "miniatura", "action figure", "funko",
  "infantil", "bebe", "bebê", "crianca", "criança", "kids", "menino", "menina",
  "adesivo", "poster", "pôster", "quadro", "placa", "caneca", "copo", "garrafa",
  "chaveiro", "capinha", "pelicula", "película", "celular", "livro", "revista",
  "cd ", "dvd", "vinil", "disco", "pet", "cachorro", "racao", "ração", "coleira",
  "fingerboard", "skate de dedo", "pelucia", "pelúcia", "almofada", "tapete", "toalha",
  "urso", "ursinho", "teddy", "slim", "skinny", "social", "polo", "academia", "fitness",
  "ciclismo", "termica", "térmica", "pijama", "lingerie", "biquini", "maio", "maiô"
];

// Aceita todas as variações de roupas e acessórios street/góticos
const PALAVRAS_VESTUARIO = [
  "camiseta", "camisa", "blusa", "t-shirt", "tshirt", "oversized", "regata", "peita", "baby look", "cropped",
  "calca", "calça", "bermuda", "short", "jort", "jortz", "jeans", "cargo", "baggy", "balao", "balão", "jogger", "wide",
  "conjunto", "moletom", "jaqueta", "casaco", "hoodie", "corta vento", "puffer", "ziper", "zíper", "sueter", "tricô", "trico",
  "bone", "boné", "gorro", "touca", "bucket", "five panel", "snapback", "chapéu", "chapeu",
  "corrente", "colar", "gargantilha", "choker", "pulseira", "bracelete", "anel", "brinco", "grumet", "inox", "prata", "cruz",
  "cinto", "rebite", "ilhos", "ilhós", "spike", "luva", "meia", "coturno", "bota",
  "oculos", "óculos", "relogio", "relógio", "shoulder", "bolsa", "bag", "mochila", "pochete"
];

function ehRoupaValida(titulo) {
  const t = (titulo || "").toLowerCase();
  if (PALAVRAS_BLOQUEADAS.some(b => t.includes(b))) return false;
  return PALAVRAS_VESTUARIO.some(v => t.includes(v));
}

async function lerBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  const raw = Buffer.concat(buffers).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
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

    const body = await lerBody(req);
    const urlObj = new URL(req.url || "/api/shopee", "http://localhost");
    const action = req.query?.action || urlObj.searchParams.get("action") || body.action || "import_step";

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

    // 2. LIMPAR CATÁLOGO
    if (action === "clear_all") {
      await sbRest("produtos?id=not.is.null", { method: "DELETE" });
      return res.status(200).json({ ok: true });
    }

    // 3. IMPORTAR ROUPAS STREETWEAR & GÓTICO (COM AUTO-SALTO DE PÁGINA)
    if (action === "import_step" || action === "import_items") {
      const sorteado = GRADE_STREETWEAR_GOTICO[Math.floor(Math.random() * GRADE_STREETWEAR_GOTICO.length)];
      const loteEnviado = Array.isArray(body.lotes) && body.lotes.length === 1 ? body.lotes[0] : null;

      const kw = (body.kw || loteEnviado?.kw || sorteado.kw).trim();
      const catNome = (body.cat || loteEnviado?.cat || sorteado.cat).trim();
      let paginaInicial = parseInt(body.page, 10) || 1;

      const catsAtuais = (await sbRest("categorias?select=*")) || [];
      let catObj = catsAtuais.find(c => c.nome.toLowerCase() === catNome.toLowerCase());
      if (!catObj) {
        const nova = await sbRest("categorias", {
          method: "POST",
          body: JSON.stringify({ nome: catNome })
        });
        catObj = nova?.[0];
      }

      const prodsAtuais = (await sbRest("produtos?select=nome,link")) || [];
      const nomesExistentes = new Set(prodsAtuais.map(p => (p.nome || "").toLowerCase()));
      const linksExistentes = new Set(prodsAtuais.map(p => p.link).filter(Boolean));

      const novosProdutos = [];
      const agora = new Date().toISOString();
      let totalAnalisados = 0;

      // Tenta até 2 páginas seguidas caso a primeira já tenha todas as roupas cadastradas
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        const pag = paginaInicial + tentativa;
        const q = `query {
          productOfferV2(keyword: ${JSON.stringify(kw)}, page: ${pag}, limit: 35) {
            nodes { itemId productName priceMin imageUrl offerLink sales ratingStar }
          }
        }`;

        let data;
        try {
          data = await shopeeGraphQL(q);
        } catch (e) {
          break;
        }

        const nodes = data?.productOfferV2?.nodes || [];
        totalAnalisados += nodes.length;
        if (nodes.length === 0) break;

        // Ordena priorizando os que têm vendas registradas, mas sem descartar os demais
        nodes.sort((a, b) => (parseInt(b.sales, 10) || 0) - (parseInt(a.sales, 10) || 0));

        for (const item of nodes) {
          if (novosProdutos.length >= 8) break;

          const nomeLimpo = (item.productName || "").trim().slice(0, 90);
          if (!nomeLimpo) continue;
          if (nomesExistentes.has(nomeLimpo.toLowerCase())) continue;
          if (item.offerLink && linksExistentes.has(item.offerLink)) continue;
          if (!ehRoupaValida(nomeLimpo)) continue;

          const precoCartao = parseFloat(item.priceMin) || 0;
          // Permite peças de R$ 12 até R$ 220 (cobre camisetas, calças balão e moletons góticos)
          if (precoCartao < 12 || precoCartao > 220) continue;

          const vendas = parseInt(item.sales, 10) || 0;
          const nota = parseFloat(item.ratingStar) || 0;

          nomesExistentes.add(nomeLimpo.toLowerCase());
          if (item.offerLink) linksExistentes.add(item.offerLink);

          const textoNota = nota > 0 ? `⭐ ${nota.toFixed(1)}` : "⭐ Destaque";
          const textoVendas = vendas > 0 ? `🔥 ${vendas} vendidos` : "🔥 Achado Street";

          novosProdutos.push({
            nome: nomeLimpo,
            categoria_id: catObj?.id,
            preco: precoCartao,
            link: item.offerLink,
            descricao: `${textoNota} | ${textoVendas} [REF:${item.itemId}]`,
            foto_url: item.imageUrl,
            atualizado_em: agora,
            preco_atualizado_em: agora
          });
        }

        if (novosProdutos.length >= 4) break; // Se já achou boas peças nesta página, não precisa pedir a próxima
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
        analisados: totalAnalisados
      });
    }

    // 4. ATUALIZAR PREÇOS (3 POR VEZ)
    if (action === "sync_prices") {
      const produtos = (await sbRest("produtos?select=*&order=preco_atualizado_em.asc.nullsfirst&limit=3")) || [];
      let atualizados = 0;

      for (const prod of produtos) {
        try {
          const palavras = (prod.nome || "").split(" ").slice(0, 4).join(" ");
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

    return res.status(200).json({ ok: true, adicionados: 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};