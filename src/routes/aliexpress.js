import express from "express";
import { getAuthUrl, handleCallback, searchProducts, createOrder, getTracking, testApiConnection, searchProductsByCategory } from "../api/aliexpress.js";
import { loadTokens } from "../utils/tokenManager.js";

const router = express.Router();

router.get("/auth", (req, res) => res.json({ url: getAuthUrl() }));

router.get("/config", (req, res) => {
  res.json({
    app_key: process.env.APP_KEY || "517616",
    redirect_uri: process.env.REDIRECT_URI || "https://mercadodasophia-api.onrender.com/api/aliexpress/oauth-callback",
    base_url: "https://api-sg.aliexpress.com"
  });
});

router.get("/oauth-callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Código de autorização não encontrado");
  try {
    await handleCallback(code);
    res.send("✅ Autorização concluída e tokens salvos!");
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/products", async (req, res) => {
  try {
    const products = await searchProducts(req.query.q || "electronics");
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/order", async (req, res) => {
  try {
    const order = await createOrder(req.body);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tracking", async (req, res) => {
  if (!req.query.id) return res.status(400).json({ error: "ID do pedido é obrigatório" });
  try {
    const tracking = await getTracking(req.query.id);
    res.json(tracking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/test", async (req, res) => {
  try {
    const result = await testApiConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/products/category", async (req, res) => {
  try {
    const categoryId = req.query.categoryId || "3"; // 3 = Apparel & Accessories
    const result = await searchProductsByCategory(categoryId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tokens/status", (req, res) => {
  const tokens = loadTokens();
  if (tokens) {
    res.json({
      status: "✅ Autorizado",
      access_token: tokens.access_token ? "✅ Presente" : "❌ Ausente",
      refresh_token: tokens.refresh_token ? "✅ Presente" : "❌ Ausente",
      expires_in: tokens.expires_in || "N/A",
      updated_at: new Date(tokens.updated_at).toLocaleString(),
      expires_at: new Date(tokens.updated_at + (tokens.expires_in || 3600) * 1000).toLocaleString()
    });
  } else {
    res.json({
      status: "❌ Não autorizado",
      message: "Faça login primeiro em /api/aliexpress/auth"
    });
  }
});

export default router;
