const crypto = require("crypto");

const SUPABASE_URL = "https://opohtwavqvtfykfgzkmx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wb2h0d2F2cXZ0ZnlrZmd6a214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNTk0MTksImV4cCI6MjEwODkzNTQxOX0.Tklm_2VpnDjVzPqUiEeN8j41X0ug4zet34fJCvODsI0";

const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID;
const SHOPEE_SECRET = process.env.SHOPEE_SECRET;

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
  if (json.errors) throw new Error(json.errors[0]?.message || "Erro na API da Shopee");
  return json.data;
}

module.exports = async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const isCron = req.headers["x-vercel-cron"] === "1";

    // Verifica se o usuário está logado como Admin no Supabase
    if (!isCron) {
      if (!token) return res.status(401).json({ error: "Faça login como Admin primeiro." });
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`
        }
      });
      if (!userRes.ok) {
        return res.status(401).json({ error: "Sessão inválida. Entre novamente como Admin." });
      }
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

    // AÇÃO 1: CONVERTER LINK PARA AFILIADO
    if (action === "convert_link") {
      const q = `mutation {
        generateShortLink(input: { originUrl: ${JSON.stringify(body.url)}, subIds: ["DeQuebra"] }) {
          shortLink
        }
      }`;
      const data = await shopeeGraphQL(q);
      return res.status(200).json({ shortLink: data?.generateShortLink?.shortLink });
    }

    // AÇÃO 2: IMPORTAR ROUPAS E ACESSÓRIOS
    if (action === "import_items") {
      const lotes = body.lotes || [
        { kw: "camiseta oversized streetwear heavy cotton", cat: "Camisetas", limit: 5 },
        { kw: "calca cargo larga baggy streetwear", cat: "Calças & Bermudas", limit: 5 },
        { kw: "moletom canguru oversized hoodie streetwear", cat: "Moletons & Jaquetas", limit: 4 },
        { kw: "bone dad hat five panel gorro beanie streetwear", cat: "Bonés & Gorros", limit: 4 },
        { kw: "corrente masculina inox prata anel oculos vintage", cat: "Acessórios", limit: 5 },
        { kw: "shoulder bag transversal streetwear", cat: "Shoulder Bags", limit: 4 }
      ];

      const catsAtuais = (await sbRest("categorias?select=*")) || [];
      const mapaCats = {};
      catsAtuais.forEach(c => { mapaCats[c.nome.toLowerCase()] = c.id; });

      const prodsAtuais = (await sbRest("produtos?select=nome")) || [];
      const nomesExistentes = new Set(prodsAtuais.map(p => p.nome));

      let adicionados = 0;

      for (const lote of lotes) {
        let catId = mapaCats[lote.cat.toLowerCase()];
        if (!catId) {
          const novaCat = await sbRest("categorias", {
            method: "POST",
            body: JSON.stringify({ nome: lote.cat })
          });
          if (novaCat?.[0]) {
            catId = novaCat[0].id;
            mapaCats[lote.cat.toLowerCase()] = catId;
          }
        }

        const q = `query {
          productOfferV2(keyword: ${JSON.stringify(lote.kw)}, sortType: 2, page: 1, limit: ${lote.limit || 5}) {
            nodes { itemId productName priceMin imageUrl offerLink sales ratingStar }
          }
        }`;
        const data = await shopeeGraphQL(q);
        const nodes = data?.productOfferV2?.nodes || [];

        for (const item of nodes) {
          const nomeLimpo = (item.productName || "").trim().slice(0, 90);
          if (!nomeLimpo || nomesExistentes.has(nomeLimpo)) continue;

          const agora = new Date().toISOString();
          const desc = `⭐ ${item.ratingStar || "4.9"} | 🔥 +${item.sales || 100} vendidos [REF:${item.itemId}]`;

          await sbRest("produtos", {
            method: "POST",
            body: JSON.stringify({
              nome: nomeLimpo,
              categoria_id: catId,
              preco: parseFloat(item.priceMin) || null,
              link: item.offerLink,
              descricao: desc,
              foto_url: item.imageUrl,
              atualizado_em: agora,
              preco_atualizado_em: agora
            })
          });

          nomesExistentes.add(nomeLimpo);
          adicionados++;
        }
      }
      return res.status(200).json({ ok: true, adicionados });
    }

    // AÇÃO 3: SINCRONIZAR PREÇOS AUTOMATICAMENTE
    if (action === "sync_prices") {
      const produtos = (await sbRest("produtos?select=*")) || [];
      let atualizados = 0;
      let verificados = 0;

      for (const prod of produtos) {
        const matchRef = (prod.descricao || "").match(/\[REF:(\d+)\]/);
        const matchUrl = (prod.link || "").match(/-i\.\d+\.(\d+)/);
        const itemId = matchRef?.[1] || matchUrl?.[1];

        const filtro = itemId
          ? `itemId: ${itemId}, limit: 1`
          : `keyword: ${JSON.stringify((prod.nome || "").slice(0, 50))}, limit: 1`;

        const q = `query {
          productOfferV2(${filtro}) {
            nodes { itemId priceMin offerLink imageUrl }
          }
        }`;

        const data = await shopeeGraphQL(q);
        const info = data?.productOfferV2?.nodes?.[0];
        verificados++;

        if (info && info.priceMin) {
          const novoPreco = parseFloat(info.priceMin);
          const precoAntigo = parseFloat(prod.preco);
          const agora = new Date().toISOString();

          const payloadUpdate = (!isNaN(novoPreco) && novoPreco !== precoAntigo)
            ? { preco: novoPreco, preco_atualizado_em: agora, atualizado_em: agora }
            : { preco_atualizado_em: agora };

          if (!isNaN(novoPreco) && novoPreco !== precoAntigo) atualizados++;

          await sbRest(`produtos?id=eq.${prod.id}`, {
            method: "PATCH",
            body: JSON.stringify(payloadUpdate)
          });
        }
      }

      return res.status(200).json({ ok: true, verificados, atualizados });
    }

    return res.status(400).json({ error: "Ação inválida" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};