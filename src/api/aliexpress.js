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
  // Formato correto: YYYY-MM-DD HH:mm:ss (um espaço apenas)
  const now = new Date();
  const timestamp = now.getFullYear() + '-' + 
                   String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(now.getDate()).padStart(2, '0') + ' ' + 
                   String(now.getHours()).padStart(2, '0') + ':' + 
                   String(now.getMinutes()).padStart(2, '0') + ':' + 
                   String(now.getSeconds()).padStart(2, '0');
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
    const { data } = await axios.post(`${BASE_URL}`, 
      new URLSearchParams({ ...params, sign }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log('✅ Resposta:', data);
    return data;
  } catch (error) {
    console.log('❌ Erro na API:', error.response?.data || error.message);
    throw error;
  }
};

export const searchProducts = async (keyword) => {
  // Formato correto: YYYY-MM-DD HH:mm:ss (um espaço apenas)
  const now = new Date();
  const timestamp = now.getFullYear() + '-' + 
                   String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(now.getDate()).padStart(2, '0') + ' ' + 
                   String(now.getHours()).padStart(2, '0') + ':' + 
                   String(now.getMinutes()).padStart(2, '0') + ':' + 
                   String(now.getSeconds()).padStart(2, '0');
  
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
    const { data } = await axios.post(`${BASE_URL}`, 
      new URLSearchParams({ ...params, sign }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
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
