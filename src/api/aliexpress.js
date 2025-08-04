import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import { saveTokens, loadTokens, refreshTokenIfNeeded } from "../utils/tokenManager.js";

dotenv.config({ path: '../../config.env' });

const BASE_URL = "https://api-sg.aliexpress.com";
const { APP_KEY, APP_SECRET, REDIRECT_URI } = process.env;

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

export const getAuthUrl = () => `${BASE_URL}/oauth/authorize?response_type=code&client_id=${APP_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

export const handleCallback = async (code) => {
  const { data } = await axios.post(`${BASE_URL}/oauth/token`, new URLSearchParams({
    grant_type: "authorization_code",
    client_id: APP_KEY,
    client_secret: APP_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
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
    app_key: APP_KEY,
    session: tokens.access_token,
    timestamp,
    sign_method: "md5",
    format: "json",
    v: "2.0",
    ...extraParams
  };
  const sign = generateSign(params);
  const { data } = await axios.get(`${BASE_URL}/router/rest`, { params: { ...params, sign } });
  return data;
};

export const searchProducts = async (keyword) => {
  return callAliExpress("aliexpress.ds.product.get", { keywords: keyword, page_size: 5 });
};

export const createOrder = async (orderData) => {
  return callAliExpress("aliexpress.ds.order.create", orderData);
};

export const getTracking = async (orderId) => {
  return callAliExpress("aliexpress.ds.logistics.get", { order_id: orderId });
};
