import express from "express";
import { getAuthUrl, handleCallback, searchProducts, createOrder, getTracking, testApiConnection, searchProductsByCategory } from "../api/aliexpress.js";
import { loadTokens } from "../utils/tokenManager.js";
import dotenv from "dotenv";

dotenv.config({ path: '../../config.env' });

// Valores padrão para desenvolvimento
const DEFAULT_APP_KEY = "517616";
const DEFAULT_APP_SECRET = "TTqNmTMs5Q0QiPbulDNenhXr2My18nN4";
const DEFAULT_REDIRECT_URI = "https://mercadodasophia-api.onrender.com/api/aliexpress/oauth-callback";

const { APP_KEY, APP_SECRET, REDIRECT_URI } = process.env;

// Usar valores das variáveis de ambiente ou padrões
const FINAL_APP_KEY = APP_KEY || DEFAULT_APP_KEY;
const FINAL_APP_SECRET = APP_SECRET || DEFAULT_APP_SECRET;
const FINAL_REDIRECT_URI = REDIRECT_URI || DEFAULT_REDIRECT_URI;

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
  
  console.log('🔍 Callback OAuth recebido com code:', code);
  
  try {
    const result = await handleCallback(code);
    console.log('✅ Callback OAuth processado com sucesso:', {
      has_access_token: !!result.access_token,
      has_refresh_token: !!result.refresh_token,
      expires_in: result.expires_in
    });
    res.send("✅ Autorização concluída e tokens salvos!");
  } catch (err) {
    console.log('❌ Erro no callback OAuth:', err.message);
    res.status(500).send(`Erro: ${err.message}`);
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
      expires_at: new Date(tokens.updated_at + (tokens.expires_in || 3600) * 1000).toLocaleString(),
      // Debug: mostrar dados completos
      debug: {
        has_access_token: !!tokens.access_token,
        has_refresh_token: !!tokens.refresh_token,
        token_keys: Object.keys(tokens),
        access_token_length: tokens.access_token?.length || 0,
        refresh_token_length: tokens.refresh_token?.length || 0
      }
    });
  } else {
    res.json({
      status: "❌ Não autorizado",
      message: "Faça login primeiro em /api/aliexpress/auth"
    });
  }
});

// Rota para verificar configuração do app
router.get("/app/config", (req, res) => {
  try {
    console.log('🔍 Configuração do app:', {
      APP_KEY: FINAL_APP_KEY,
      APP_SECRET: '***HIDDEN***',
      REDIRECT_URI: FINAL_REDIRECT_URI,
      AUTH_URL: getAuthUrl()
    });
    
    res.json({
      success: true,
      app_key: FINAL_APP_KEY,
      redirect_uri: FINAL_REDIRECT_URI,
      auth_url: getAuthUrl(),
      debug_info: {
        app_key_length: FINAL_APP_KEY.length,
        app_secret_length: FINAL_APP_SECRET.length,
        redirect_uri_length: FINAL_REDIRECT_URI.length,
        is_https: FINAL_REDIRECT_URI.startsWith('https://'),
        has_api_path: FINAL_REDIRECT_URI.includes('/api/aliexpress/oauth-callback')
      }
    });
  } catch (error) {
    console.log('❌ Erro ao verificar configuração:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para testar diferentes endpoints OAuth
router.get("/test/oauth-endpoints", async (req, res) => {
  try {
    const testCode = "test_code_123";
    const endpoints = [
      "https://api-sg.aliexpress.com/auth/token/create", // ✅ Endpoint oficial da documentação
      "https://api-sg.aliexpress.com/oauth/token",
      "https://api-sg.aliexpress.com/oauth/access_token", 
      "https://api-sg.aliexpress.com/oauth2/token"
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.post(
          endpoint,
          new URLSearchParams({
            grant_type: "authorization_code",
            client_id: FINAL_APP_KEY,
            client_secret: FINAL_APP_SECRET,
            redirect_uri: FINAL_REDIRECT_URI,
            code: testCode,
          }),
          { 
            headers: { 
              "Content-Type": "application/x-www-form-urlencoded"
            } 
          }
        );
        
        results.push({
          endpoint,
          status: response.status,
          content_type: response.headers['content-type'],
          success: true
        });
      } catch (error) {
        results.push({
          endpoint,
          status: error.response?.status || 'N/A',
          content_type: error.response?.headers?.['content-type'] || 'N/A',
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
