import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import { saveTokens, loadTokens, refreshTokenIfNeeded } from "../utils/tokenManager.js";

dotenv.config({ path: '../../config.env' });

// URLs diferentes para System Interfaces e Business Interfaces
const SYSTEM_BASE_URL = "https://api-sg.aliexpress.com/rest";
const BUSINESS_BASE_URL = "https://api-sg.aliexpress.com/sync";

// Valores padrão para desenvolvimento
const DEFAULT_APP_KEY = "517616";
const DEFAULT_APP_SECRET = "TTqNmTMs5Q0QiPbulDNenhXr2My18nN4";
const DEFAULT_REDIRECT_URI = "https://mercadodasophia-api.onrender.com/api/aliexpress/oauth-callback";

const { APP_KEY, APP_SECRET, REDIRECT_URI } = process.env;

// Usar valores das variáveis de ambiente ou padrões
const FINAL_APP_KEY = APP_KEY || DEFAULT_APP_KEY;
const FINAL_APP_SECRET = APP_SECRET || DEFAULT_APP_SECRET;
const FINAL_REDIRECT_URI = REDIRECT_URI || DEFAULT_REDIRECT_URI;

// Função para sincronizar timestamp com servidor da AliExpress
async function getAliExpressTimestamp() {
  try {
    // Sincroniza com servidor da AliExpress usando fetch
    const response = await fetch('https://api-sg.aliexpress.com', { method: 'HEAD' });
    const dateHeader = response.headers.get('date'); // Ex: Mon, 04 Aug 2025 18:45:34 GMT
    
    if (!dateHeader) {
      throw new Error('Header Date não encontrado');
    }
    
    const serverDate = new Date(dateHeader);
    
    // Teste 1: Timestamp em milissegundos (13 dígitos)
    const timestampMs = serverDate.getTime();
    
    // Teste 2: Timestamp UTC+8 (hora de Pequim)
    const beijingTime = serverDate.getTime() + (8 * 3600 * 1000);
    const timestampBeijing = Math.floor(beijingTime / 1000);
    
    // Teste 3: Timestamp UTC normal (10 dígitos) - padrão atual
    const timestampUtc = Math.floor(serverDate.getTime() / 1000);
    
    console.log('🔍 Timestamps gerados:');
    console.log('🔍 UTC (10 dígitos):', timestampUtc);
    console.log('🔍 UTC+8 Beijing (10 dígitos):', timestampBeijing);
    console.log('🔍 Milissegundos (13 dígitos):', timestampMs);
    console.log('🔍 Horário do servidor AliExpress:', serverDate.toString());
    console.log('🔍 Header Date recebido:', dateHeader);
    
    // Por enquanto, vamos testar com UTC+8 (Beijing)
    return timestampBeijing;
  } catch (error) {
    console.log('⚠️ Erro ao sincronizar com AliExpress:', error.message);
    console.log('⚠️ Usando timestamp local como fallback');
    
    // Fallback para timestamp local
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    
    console.log('🔍 Timestamp local gerado:', timestamp);
    console.log('🔍 Horário local:', now.toString());
    
    return timestamp;
  }
}

// Gera assinatura HMAC-SHA256 seguindo documentação oficial AliExpress
const generateSign = (params, isSystemInterface = false, apiPath = '') => {
  // Converte valores para string e remove espaços extras (trim)
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    // Garante que timestamp seja sempre string
    if (key === 'timestamp') {
      cleanParams[key] = String(params[key]);
    } else {
      cleanParams[key] = params[key].toString().trim();
    }
  });

  // Ordena lexicograficamente as chaves
  const orderedKeys = Object.keys(cleanParams).sort();

  // Concatena chave+valor sem separadores
  let baseString = '';
  
  // Para System Interfaces, adiciona o API path no início
  if (isSystemInterface && apiPath) {
    baseString += apiPath;
  }
  
  for (const key of orderedKeys) {
    baseString += key + cleanParams[key];
  }

  console.log('🔍 String para assinatura:', baseString);
  console.log('🔍 Parâmetros ordenados:', orderedKeys);
  console.log('🔍 Tipo de interface:', isSystemInterface ? 'System' : 'Business');

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
  // Compara timestamps para debug
  const localEpoch = Math.floor(Date.now() / 1000);
  const aliExpressEpoch = await getAliExpressTimestamp();
  const difference = Math.abs(localEpoch - aliExpressEpoch);
  
  console.log('🔍 Comparação de timestamps:');
  console.log('🔍 Local epoch:', localEpoch);
  console.log('🔍 AliExpress epoch:', aliExpressEpoch);
  console.log('🔍 Diferença em segundos:', difference);
  console.log('🔍 Aceitável (< 180s):', difference < 180 ? '✅' : '❌');
  
  const timestamp = aliExpressEpoch;
  const params = {
    method,
    app_key: FINAL_APP_KEY,
    timestamp,
    sign_method: "hmac-sha256",
    format: "json",
    v: "1.0",
    ...extraParams
  };
  
  // Business Interface: não adiciona API path na assinatura
  const sign = generateSign(params, false);
  
  console.log('🔍 Chamando API AliExpress:', method);
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    // Deixa o URLSearchParams cuidar do encode automaticamente
    const query = new URLSearchParams({
      ...params,
      sign
    }).toString();
    
    // Business Interface: usa /sync endpoint
    const url = `${BUSINESS_BASE_URL}?${query}`;
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
  // Timestamp UTC sincronizado com AliExpress
  const timestamp = await getAliExpressTimestamp();
  
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
  
  // Business Interface: não adiciona API path na assinatura
  const sign = generateSign(params, false);
  
  console.log('🔍 Buscando produtos:', keyword);
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    // Deixa o URLSearchParams cuidar do encode automaticamente
    const query = new URLSearchParams({
      ...params,
      sign
    }).toString();
    
    // Business Interface: usa /sync endpoint
    const url = `${BUSINESS_BASE_URL}?${query}`;
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
