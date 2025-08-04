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

export const getAuthUrl = () => {
  const authUrl = `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=${FINAL_APP_KEY}&redirect_uri=${encodeURIComponent(FINAL_REDIRECT_URI)}`;
  console.log('🔍 URL de autorização gerada:', authUrl);
  console.log('🔍 Parâmetros da URL:', {
    response_type: 'code',
    client_id: FINAL_APP_KEY,
    redirect_uri: FINAL_REDIRECT_URI,
    encoded_redirect_uri: encodeURIComponent(FINAL_REDIRECT_URI)
  });
  return authUrl;
};

export const handleCallback = async (code) => {
  console.log('🔍 Processando callback OAuth com code:', code);
  
  try {
    // Implementação exata conforme documentação AliExpress
    console.log('🔍 Tentando endpoint OAuth:', "https://api-sg.aliexpress.com/oauth/token");
    
    const response = await axios.post(
      "https://api-sg.aliexpress.com/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: FINAL_APP_KEY,
        client_secret: FINAL_APP_SECRET,
        redirect_uri: FINAL_REDIRECT_URI,
        code: code,
      }),
      { 
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        } 
      }
    );
    
    console.log('🔍 Parâmetros OAuth enviados:', {
      grant_type: "authorization_code",
      client_id: FINAL_APP_KEY,
      client_secret: "***HIDDEN***",
      redirect_uri: FINAL_REDIRECT_URI,
      code: code,
    });
    
    console.log('✅ Resposta OAuth completa:', {
      status: response.status,
      headers: response.headers,
      data: response.data,
      data_keys: Object.keys(response.data || {}),
      data_type: typeof response.data
    });
    
    console.log('✅ Resposta OAuth resumida:', {
      status: response.status,
      access_token: response.data?.access_token ? '✅ Presente' : '❌ Ausente',
      refresh_token: response.data?.refresh_token ? '✅ Presente' : '❌ Ausente',
      expires_in: response.data?.expires_in || 'N/A',
      token_type: response.data?.token_type || 'N/A'
    });
    
    saveTokens(response.data);
    return response.data;
  } catch (error) {
    console.log('❌ Erro no callback OAuth:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      full_error: error
    });
    throw error;
  }
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
    method: "aliexpress.ds.product.get",
    app_key: FINAL_APP_KEY,
    timestamp,
    sign_method: "hmac-sha256",
    format: "json",
    v: "1.0",
    productId: "1005005474567890", // ID de produto de exemplo
    local: "en_US", // Parâmetro obrigatório: local (sem "e")
    locale: "en_US", // Parâmetro adicional: locale (com "e")
    countryCode: "US", // Case-sensitive: countryCode
    currency: "USD"
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

// Função para testar se a API está funcionando
export const testApiConnection = async () => {
  const timestamp = await getAliExpressTimestamp();
  
  const params = {
    method: "aliexpress.ds.category.get",
    app_key: FINAL_APP_KEY,
    timestamp,
    sign_method: "hmac-sha256",
    format: "json",
    v: "1.0",
    local: "en_US",
    locale: "en_US"
  };
  
  // Business Interface: não adiciona API path na assinatura
  const sign = generateSign(params, false);
  
  console.log('🔍 Testando conexão com API AliExpress');
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    const query = new URLSearchParams({
      ...params,
      sign
    }).toString();
    
    const url = `${BUSINESS_BASE_URL}?${query}`;
    console.log('🔍 URL da requisição:', url);
    
    const { data } = await axios.get(url);
    console.log('✅ Resposta teste:', data);
    return data;
  } catch (error) {
    console.log('❌ Erro no teste:', error.response?.data || error.message);
    throw error;
  }
};

// Função para buscar produtos por categoria
export const searchProductsByCategory = async (categoryId = "3") => {
  const timestamp = await getAliExpressTimestamp();
  
  // Carregar tokens se disponível
  const tokens = loadTokens();
  const accessToken = tokens?.access_token;
  
  const params = {
    method: "aliexpress.ds.product.get",
    app_key: FINAL_APP_KEY,
    timestamp,
    sign_method: "hmac-sha256",
    format: "json",
    v: "1.0",
    categoryId: categoryId, // ID da categoria (3 = Apparel & Accessories)
    local: "en_US",
    locale: "en_US",
    countryCode: "US",
    currency: "USD"
  };
  
  // Adicionar access_token se disponível
  if (accessToken) {
    params.access_token = accessToken;
    console.log('🔑 Usando access_token:', accessToken.substring(0, 10) + '...');
  } else {
    console.log('⚠️ Nenhum access_token disponível');
  }
  
  // Business Interface: não adiciona API path na assinatura
  const sign = generateSign(params, false);
  
  console.log('🔍 Buscando produtos por categoria:', categoryId);
  console.log('📊 Parâmetros:', params);
  console.log('🔑 Assinatura:', sign);
  
  try {
    const query = new URLSearchParams({
      ...params,
      sign
    }).toString();
    
    const url = `${BUSINESS_BASE_URL}?${query}`;
    console.log('🔍 URL da requisição:', url);
    
    const { data } = await axios.get(url);
    console.log('✅ Resposta produtos por categoria:', data);
    return data;
  } catch (error) {
    console.log('❌ Erro na busca por categoria:', error.response?.data || error.message);
    throw error;
  }
};
