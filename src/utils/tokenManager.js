import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: '../../config.env' });
const TOKEN_FILE = "./data/tokens.json";
const { APP_KEY, APP_SECRET } = process.env;

// Valores padrão
const DEFAULT_APP_KEY = "517616";
const DEFAULT_APP_SECRET = "TTqNmTMs5Q0QiPbulDNenhXr2My18nN4";

const FINAL_APP_KEY = APP_KEY || DEFAULT_APP_KEY;
const FINAL_APP_SECRET = APP_SECRET || DEFAULT_APP_SECRET;

// Cache em memória para tokens (Render não persiste arquivos)
let tokenCache = null;

export const saveTokens = (tokens) => {
  console.log('💾 Salvando tokens:', {
    access_token: tokens.access_token ? '✅ Presente' : '❌ Ausente',
    refresh_token: tokens.refresh_token ? '✅ Presente' : '❌ Ausente',
    expires_in: tokens.expires_in || 'N/A',
    token_type: tokens.token_type || 'N/A'
  });
  
  // Salvar em memória (principal)
  tokenCache = { ...tokens, updated_at: Date.now() };
  
  // Tentar salvar em arquivo (backup)
  try {
    const dataDir = './data';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenCache, null, 2));
    console.log('✅ Tokens salvos em arquivo');
  } catch (error) {
    console.log('⚠️ Erro ao salvar em arquivo:', error.message);
    console.log('✅ Tokens salvos apenas em memória');
  }
};

export const loadTokens = () => {
  // Primeiro tentar carregar da memória
  if (tokenCache) {
    console.log('✅ Tokens carregados da memória');
    return tokenCache;
  }
  
  // Depois tentar carregar do arquivo
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
      tokenCache = tokens;
      console.log('✅ Tokens carregados do arquivo');
      return tokens;
    }
  } catch (error) {
    console.log('⚠️ Erro ao carregar do arquivo:', error.message);
  }
  
  console.log('❌ Nenhum token encontrado');
  return null;
};

export const refreshTokenIfNeeded = async () => {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Tokens não encontrados. Faça login primeiro.");

  const expiresIn = (tokens.expires_in || 3600) * 1000;
  const expired = Date.now() - tokens.updated_at > expiresIn - 60000;

  if (!expired) return tokens;

  console.log("🔄 Renovando token...");
  const { data } = await axios.post(`https://api-sg.aliexpress.com/oauth/token`, new URLSearchParams({
    grant_type: "refresh_token",
    client_id: FINAL_APP_KEY,
    client_secret: FINAL_APP_SECRET,
    refresh_token: tokens.refresh_token,
  }));
  saveTokens(data);
  return data;
};
