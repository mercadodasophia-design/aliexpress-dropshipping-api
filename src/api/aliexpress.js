import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import { saveTokens, loadTokens, refreshTokenIfNeeded } from "../utils/tokenManager.js";

dotenv.config({ path: '../../config.env' });

const BASE_URL = "https://api-sg.aliexpress.com/rest";

// Valores padrão para desenvolvimento
const DEFAULT_APP_KEY = "517616";
const DEFAULT_APP_SECRET = "TTqNmTMs5Q0QiPbulDNenhXr2My18nN4";
const DEFAULT_REDIRECT_URI = "https://mercadodasophia-api.onrender.com/api/aliexpress/oauth-callback";

const { APP_KEY, APP_SECRET, REDIRECT_URI } = process.env;

// Usar valores das variáveis de ambiente ou padrões
const FINAL_APP_KEY = APP_KEY || DEFAULT_APP_KEY;
const FINAL_APP_SECRET = APP_SECRET || DEFAULT_APP_SECRET;
const FINAL_REDIRECT_URI = REDIRECT_URI || DEFAULT_REDIRECT_URI;

// Função para gerar timestamp UTC no formato AliExpress
function getAliExpressTimestamp() {
  const now = new Date();
  // Formato yyyy-MM-dd HH:mm:ss em UTC puro
  const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');
  
  console.log('🔍 Timestamp UTC gerado:', timestamp);
  console.log('🔍 Horário local:', now.toString());
  console.log('🔍 Horário UTC:', now.toISOString());
  console.log('🔍 Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
  console.log('🔍 Offset:', now.getTimezoneOffset(), 'minutos');
  
  return timestamp;
}

// Gera assinatura HMAC-SHA256 (padrão AliExpress Open Platform)
const generateSign = (params) => {
  // Converte valores para string e remove espaços extras (trim)
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    cleanParams[key] = params[key].toString().trim();
  });

  // Ordena lexicograficamente as chaves
  const orderedKeys = Object.keys(cleanParams).sort();

  // Concatena chave+valor sem separadores
  let baseString = '';
  for (const key of orderedKeys) {
    baseString += key + cleanParams[key];
  }

  // Adiciona appSecret no fim
  baseString += FINAL_APP_SECRET;

  console.log('🔍 String para assinatura:', baseString);
  console.log('🔍 Parâmetros ordenados:', orderedKeys);

  // Cria hash HMAC-SHA256 com appSecret como chave
  const hash = crypto.createHmac('sha256', FINAL_APP_SECRET)
                     .update(baseString)
                     .digest('hex')
                     .toUpperCase();

  return hash;
};

export const getAuthUrl = () => `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=${FINAL_APP_KEY}&redirect_uri=${encodeURIComponent(FINAL_REDIRECT_URI)}`;

export const handleCallback = async (code) => {
  const { data } = await axios.post(`https://api-sg.aliexpress.com/oauth/token`, new URLSearchParams({
    grant_type: "authorization_code",
    client_id: FINAL_APP_KEY,
    client_secret: FINAL_APP_SECRET,
    code,
    redirect_uri: FINAL_REDIRECT_URI,
  }));
  saveTokens(data);
  return data;
};

// Função genérica para chamar métodos ds.*
const callAliExpress = async (method, extraParams={}) => {
  // Timestamp UTC no formato AliExpress
  const timestamp = getAliExpressTimestamp();
  const params = {
    method,
    app_key: FINAL_APP_KEY,
    timestamp,
    sign_method: "hmac-sha256",
    format: "json",
    v: "1.0",
    ...extraParams
  };
  const sign = generateSign(params);
  
  console.log('🔍 Chamando API AliExpress:', method);
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    // URL-encode o timestamp apenas para a URL (não para assinatura)
    const query = new URLSearchParams({
      ...params,
      timestamp: encodeURIComponent(params.timestamp),
      sign
    }).toString();
    
    const url = `${BASE_URL}?${query}`;
    console.log('🔍 URL da requisição:', url);
    
    const { data } = await axios.get(url);
    console.log('✅ Resposta:', data);
    return data;
  } catch (error) {
    console.log('❌ Erro na API:', error.response?.data || error.message);
    throw error;
  }
};

export const searchProducts = async (keyword) => {
  // Timestamp UTC no formato AliExpress
  const timestamp = getAliExpressTimestamp();
  
  const params = {
    method: "aliexpress.ds.text.search",
    app_key: FINAL_APP_KEY,
    timestamp,
    sign_method: "hmac-sha256",
    format: "json",
    v: "1.0",
    keyWords: keyword, // Case-sensitive: keyWords (plural, com W maiúsculo)
    locale: "en_US", // Case-sensitive: locale (não local)
    countryCode: "US", // Case-sensitive: countryCode
    currency: "USD",
    pageSize: 20,
    pageIndex: 1,
    sortBy: "min_price,asc"
  };
  
  const sign = generateSign(params);
  
  console.log('🔍 Buscando produtos:', keyword);
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    // URL-encode o timestamp apenas para a URL (não para assinatura)
    const query = new URLSearchParams({
      ...params,
      timestamp: encodeURIComponent(params.timestamp),
      sign
    }).toString();
    
    const url = `${BASE_URL}?${query}`;
    console.log('🔍 URL da requisição:', url);
    
    const { data } = await axios.get(url);
    console.log('✅ Resposta produtos:', data);
    return data;
  } catch (error) {
    console.log('❌ Erro na busca:', error.response?.data || error.message);
    throw error;
  }
};

export const createOrder = async (orderData) => {
  return callAliExpress("aliexpress.ds.order.create", orderData);
};

export const getTracking = async (orderId) => {
  return callAliExpress("aliexpress.ds.logistics.get", { order_id: orderId });
};
