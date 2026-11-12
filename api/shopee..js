import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://opohtwavqvtfykfgzkmx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wb2h0d2F2cXZ0ZnlrZmd6a214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNTk0MTksImV4cCI6MjEwODkzNTQxOX0.Tklm_2VpnDjVzPqUiEeN8j41X0ug4zet34fJCvODsI0";

// Lê as credenciais do cofre seguro da Vercel (Environment Variables)
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

export default async function handler(req, res) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const isCron = req.headers["x-vercel-cron"] === "1";

    // Cria cliente Supabase autenticado com a sessão do Admin (ou Service Key para o Cron automático)
    const sb = createClient(
      SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
      token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}
    );

    // Se não for o Cron automático da Vercel, exige que seja o Admin logado
    if (!isCron) {
      const { data: userData, error: authErr } = await sb.auth.getUser(token);
      if (authErr || !userData?.user) {
        return res.status(401).json({ error: "Acesso negado. Faça login como Admin." });
      }
    }

    const action = req.query.action || req.body?.action;

    // =========================================================================
    // AÇÃO 1: CONVERTER QUALQUER LINK DA SHOPEE PARA SEU LINK DE AFILIADO
    // =========================================================================
    if (action === "convert_link") {
      const { url } = req.body;
      const q = `mutation {
        generateShortLink(input: { originUrl: ${JSON.stringify(url)}, subIds: ["DeQuebra"] }) {
          shortLink
        }
      }`;
      const data = await shopeeGraphQL(q);
      return res.status(200).json({ shortLink: data?.generateShortLink?.shortLink });
    }

    // =========================================================================
    // AÇÃO 2: IMPORTAR ROUPAS ESTILOSAS E ACESSÓRIOS JÁ COM SEU LINK E PREÇO
    // =========================================================================
    if (action === "import_items") {
      const lotes = req.body?.lotes || [
        { kw: "camiseta oversized streetwear heavy cotton", cat: "Camisetas", limit: 5 },
        { kw: "calca cargo larga baggy streetwear", cat: "Calças & Bermudas", limit: 5 },
        { kw: "moletom canguru oversized hoodie streetwear", cat: "Moletons & Jaquetas", limit: 4 },
        { kw: "bone dad hat five panel gorro beanie streetwear", cat: "Bonés & Gorros", limit: 4 },
        { kw: "corrente masculina inox prata anel oculos vintage", cat: "Acessórios", limit: 5 },
        { kw: "shoulder bag transversal streetwear", cat: "Shoulder Bags", limit: 4 }
      ];

      const { data: catsAtuais } = await sb.from("categorias").select("*");
      const mapaCats = {};
      (catsAtuais || []).forEach(c => { mapaCats[c.nome.toLowerCase()] = c.id; });

      const { data: prodsAtuais } = await sb.from("produtos").select("nome");
      const nomesExistentes = new Set((prodsAtuais || []).map(p => p.nome));

      let adicionados = 0;

      for (const lote of lotes) {
        let catId = mapaCats[lote.cat.toLowerCase()];
        if (!catId) {
          const { data: novaCat } = await sb.from("categorias").insert({ nome: lote.cat }).select();
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
          // Guardamos a ref #ID no final da descrição para o robô conseguir acompanhar o preço exato depois
          const desc = `⭐ ${item.ratingStar || "4.9"} | 🔥 +${item.sales || 100} vendidos [REF:${item.itemId}]`;

          const { error } = await sb.from("produtos").insert({
            nome: nomeLimpo,
            categoria_id: catId,
            preco: parseFloat(item.priceMin) || null,
            link: item.offerLink,
            descricao: desc,
            foto_url: item.imageUrl,
            atualizado_em: agora,
            preco_atualizado_em: agora
          });

          if (!error) {
            nomesExistentes.add(nomeLimpo);
            adicionados++;
          }
        }
      }
      return res.status(200).json({ ok: true, adicionados });
    }

    // =========================================================================
    // AÇÃO 3: ACOMPANHAR E ATUALIZAR O PREÇO DAS ROUPAS AUTOMATICAMENTE
    // =========================================================================
    if (action === "sync_prices") {
      const { data: produtos } = await sb.from("produtos").select("*");
      let atualizados = 0;
      let verificados = 0;

      for (const prod of (produtos || [])) {
        // Extrai o itemId se existir [REF:12345] na descrição ou no link, senão busca pelo nome da roupa
        const matchRef = (prod.descricao || "").match(/\[REF:(\d+)\]/);
        const matchUrl = (prod.link || "").match(/-i\.\d+\.(\d+)/);
        const itemId = matchRef?.[1] || matchUrl?.[1];

        const filtro = itemId
          ? `itemId: ${itemId}, limit: 1`
          : `keyword: ${JSON.stringify(prod.nome.slice(0, 50))}, limit: 1`;

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

          // Se o preço mudou na Shopee, atualiza o valor no banco de dados!
          if (!isNaN(novoPreco) && novoPreco !== precoAntigo) {
            await sb.from("produtos").update({
              preco: novoPreco,
              preco_atualizado_em: agora,
              atualizado_em: agora
            }).eq("id", prod.id);
            atualizados++;
          } else {
            // Mesmo se o preço se manteve igual, registra que foi conferido hoje
            await sb.from("produtos").update({
              preco_atualizado_em: agora
            }).eq("id", prod.id);
          }
        }
      }

      return res.status(200).json({ ok: true, verificados, atualizados });
    }

    return res.status(400).json({ error: "Ação inválida" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}