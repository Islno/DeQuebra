import crypto from "crypto";

const SUPABASE_URL = "https://opohtwavqvtfykfgzkmx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wb2h0d2F2cXZ0ZnlrZmd6a214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNTk0MTksImV4cCI6MjEwODkzNTQxOX0.Tklm_2VpnDjVzPqUiEeN8j41X0ug4zet34fJCvODsI0";

const SHOPEE_APP_ID = (process.env.SHOPEE_APP_ID || "").trim();
const SHOPEE_SECRET = (process.env.SHOPEE_SECRET || "").trim();

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function shopeeGraphQL(query) {
  if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
    throw new Error("Variáveis SHOPEE_APP_ID ou SHOPEE_SECRET ausentes na Vercel.");
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

export default async function handler(req, res) {
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

    // 1. CONVERTER LINK
    if (action === "convert_link") {
      const q = `mutation {
        generateShortLink(input: { originUrl: ${JSON.stringify(body.url)}, subIds: ["DeQuebra"] }) {
          shortLink
        }
      }`;
      const data = await shopeeGraphQL(q);
      return res.status(200).json({ shortLink: data?.generateShortLink?.shortLink });
    }

    // 2. IMPORTAR ROUPAS E ACESSÓRIOS (SEQUENCIAL E COM PALAVRAS-CHAVE CURTAS)
    if (action === "import_items") {
      const lotes = body.lotes || [
        { kw: "camiseta oversized", cat: "Camisetas", limit: 4 },
        { kw: "calca cargo", cat: "Calças & Bermudas", limit: 4 },
        { kw: "moletom canguru", cat: "Moletons & Jaquetas", limit: 4 },
        { kw: "bone", cat: "Bonés & Gorros", limit: 4 },
        { kw: "corrente masculina", cat: "Acessórios", limit: 4 },
        { kw: "shoulder bag", cat: "Shoulder Bags", limit: 4 }
      ];

      const catsAtuais = (await sbRest("categorias?select=*")) || [];
      const mapaCats = {};
      catsAtuais.forEach(c => { mapaCats[c.nome.toLowerCase()] = c.id; });

      for (const lote of lotes) {
        const chave = lote.cat.toLowerCase();
        if (!mapaCats[chave]) {
          const novaCat = await sbRest("categorias", {
            method: "POST",
            body: JSON.stringify({ nome: lote.cat })
          });
          if (novaCat?.[0]) mapaCats[chave] = novaCat[0].id;
        }
      }

      const prodsAtuais = (await sbRest("produtos?select=nome")) || [];
      const nomesExistentes = new Set(prodsAtuais.map(p => p.nome));

      const novosProdutos = [];
      const agora = new Date().toISOString();
      let ultimoErroShopee = null;

      // Executa um por um com pausa de 300ms para evitar o erro 10000 da Shopee
      for (const lote of lotes) {
        try {
          const termo = (lote.kw || "").trim();
          const q = `query {
            productOfferV2(keyword: ${JSON.stringify(termo)}, sortType: 1, page: 1, limit: ${lote.limit || 4}) {
              nodes { itemId productName priceMin imageUrl offerLink sales ratingStar }
            }
          }`;
          const data = await shopeeGraphQL(q);
          const nodes = data?.productOfferV2?.nodes || [];
          const catId = mapaCats[lote.cat.toLowerCase()];

          for (const item of nodes) {
            const nomeLimpo = (item.productName || "").trim().slice(0, 90);
            if (!nomeLimpo || nomesExistentes.has(nomeLimpo)) continue;
            nomesExistentes.add(nomeLimpo);

            novosProdutos.push({
              nome: nomeLimpo,
              categoria_id: catId,
              preco: parseFloat(item.priceMin) || null,
              link: item.offerLink,
              descricao: `⭐ ${item.ratingStar || "4.9"} | 🔥 +${item.sales || 100} vendidos [REF:${item.itemId}]`,
              foto_url: item.imageUrl,
              atualizado_em: agora,
              preco_atualizado_em: agora
            });
          }
        } catch (errLote) {
          ultimoErroShopee = errLote.message;
        }
        await esperar(300);
      }

      if (novosProdutos.length === 0 && ultimoErroShopee) {
        throw new Error(ultimoErroShopee);
      }

      if (novosProdutos.length > 0) {
        await sbRest("produtos", {
          method: "POST",
          body: JSON.stringify(novosProdutos)
        });
      }

      return res.status(200).json({ ok: true, adicionados: novosProdutos.length });
    }

    // 3. SINCRONIZAR PREÇOS (SEQUENCIAL PARA NÃO BLOQUEAR NA SHOPEE)
    if (action === "sync_prices") {
      const produtos = (await sbRest("produtos?select=*")) || [];
      let atualizados = 0;
      let verificados = 0;

      for (const prod of produtos.slice(0, 15)) {
        try {
          const palavrasNome = (prod.nome || "").split(" ").slice(0, 3).join(" ");
          const q = `query {
            productOfferV2(keyword: ${JSON.stringify(palavrasNome)}, sortType: 1, page: 1, limit: 1) {
              nodes { priceMin }
            }
          }`;
          const data = await shopeeGraphQL(q);
          const info = data?.productOfferV2?.nodes?.[0];
          verificados++;

          if (info && info.priceMin) {
            const novoPreco = parseFloat(info.priceMin);
            const precoAntigo = parseFloat(prod.preco);
            const agora = new Date().toISOString();
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
          }
        } catch (e) {}
        await esperar(250);
      }

      return res.status(200).json({ ok: true, verificados, atualizados });
    }

    return res.status(400).json({ error: "Ação inválida" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}