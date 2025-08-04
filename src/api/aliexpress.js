import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import { saveTokens, loadTokens, refreshTokenIfNeeded } from "../utils/tokenManager.js";

dotenv.config({ path: '../../config.env' });

const BASE_URL = "https://api-sg.aliexpress.com";

// Valores padrão para desenvolvimento
const DEFAULT_APP_KEY = "517616";
const DEFAULT_APP_SECRET = "TTqNmTMs5Q0QiPbulDNenhXr2My18nN4";
const DEFAULT_REDIRECT_URI = "https://mercadodasophia-api.onrender.com/api/aliexpress/oauth-callback";

const { APP_KEY, APP_SECRET, REDIRECT_URI } = process.env;

// Usar valores das variáveis de ambiente ou padrões
const FINAL_APP_KEY = APP_KEY || DEFAULT_APP_KEY;
const FINAL_APP_SECRET = APP_SECRET || DEFAULT_APP_SECRET;
const FINAL_REDIRECT_URI = REDIRECT_URI || DEFAULT_REDIRECT_URI;

// Gera assinatura MD5
const generateSign = (params) => {
  const sortedKeys = Object.keys(params).sort();
  let signStr = APP_SECRET;
  sortedKeys.forEach(key => {
    if(params[key] !== undefined && params[key] !== null && params[key] !== ""){
      signStr += key + params[key];
    }
  });
  signStr += APP_SECRET;
  return crypto.createHash("md5").update(signStr).digest("hex").toUpperCase();
};

export const getAuthUrl = () => `${BASE_URL}/oauth/authorize?response_type=code&client_id=${FINAL_APP_KEY}&redirect_uri=${encodeURIComponent(FINAL_REDIRECT_URI)}`;

export const handleCallback = async (code) => {
  const { data } = await axios.post(`${BASE_URL}/oauth/token`, new URLSearchParams({
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
  const tokens = await refreshTokenIfNeeded();
  const timestamp = new Date().toISOString().slice(0,19).replace("T"," ");
  const params = {
    method,
    app_key: FINAL_APP_KEY,
    session: tokens.access_token,
    timestamp,
    sign_method: "md5",
    format: "json",
    v: "2.0",
    ...extraParams
  };
  const sign = generateSign(params);
  
  console.log('🔍 Chamando API AliExpress:', method);
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    const { data } = await axios.get(`${BASE_URL}/router/rest`, { params: { ...params, sign } });
    console.log('✅ Resposta:', data);
    return data;
  } catch (error) {
    console.log('❌ Erro na API:', error.response?.data || error.message);
    throw error;
  }
};

export const searchProducts = async (keyword) => {
  // Usar método alternativo que não requer APP_KEY específica
  const tokens = await refreshTokenIfNeeded();
  const timestamp = new Date().toISOString().slice(0,19).replace("T"," ");
  
  const params = {
    method: "aliexpress.ds.product.search",
    app_key: FINAL_APP_KEY,
    session: tokens.access_token,
    timestamp,
    sign_method: "md5",
    format: "json",
    v: "2.0",
    keywords: keyword,
    page_size: 5
  };
  
  const sign = generateSign(params);
  
  console.log('🔍 Buscando produtos:', keyword);
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    const { data } = await axios.get(`${BASE_URL}/router/rest`, { 
      params: { ...params, sign } 
    });
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
