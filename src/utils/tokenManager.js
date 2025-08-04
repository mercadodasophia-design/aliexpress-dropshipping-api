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

export const saveTokens = (tokens) => {
  // Criar pasta data se não existir
  const dataDir = './data';
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...tokens, updated_at: Date.now() }, null, 2));
};

export const loadTokens = () => {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_FILE));
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
