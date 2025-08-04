# AliExpress Dropshipping Full

Backend Node.js completo para integração com **AliExpress Dropshipping API**.

## Funcionalidades
- OAuth2 com refresh automático
- Assinatura MD5 automática
- Rotas REST para produtos, pedidos e rastreamento
- Deploy-ready para Render

## Rotas
- GET /api/aliexpress/auth
- GET /api/aliexpress/oauth-callback
- GET /api/aliexpress/products?q=palavra
- POST /api/aliexpress/order
- GET /api/aliexpress/tracking?id=ORDER_ID
