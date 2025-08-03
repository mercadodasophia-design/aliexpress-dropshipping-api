from flask import Flask, request, jsonify, redirect, session
from flask_cors import CORS
import os
from dotenv import load_dotenv
import requests
import json
import traceback
import hashlib
import time
import hmac
import base64
import urllib.parse

# Carregar variáveis de ambiente
load_dotenv('./config.env')

app = Flask(__name__)
app.secret_key = 'mercadodasophia_secret_key'
CORS(app)

# Configurações AliExpress Oficial
APP_KEY = os.getenv('ALIEXPRESS_APP_KEY')
APP_SECRET = os.getenv('ALIEXPRESS_APP_SECRET')
TRACKING_ID = os.getenv('ALIEXPRESS_TRACKING_ID', 'mercadodasophia_tracking')

# OAuth2 URLs
OAUTH_AUTH_URL = "https://auth.aliexpress.com/oauth/authorize"
OAUTH_TOKEN_URL = "https://api-sg.aliexpress.com/oauth/token"
OAUTH_REDIRECT_URI = "https://mercadodasophia-api.onrender.com/oauth/callback"

# API Base URL
API_BASE_URL = "https://api-sg.aliexpress.com/sync"

# Armazenar tokens
access_token = None
refresh_token = None

def generate_signature(params, app_secret):
    """Gerar assinatura para API AliExpress"""
    # Ordenar parâmetros
    sorted_params = sorted(params.items())
    
    # Criar string de parâmetros
    param_string = "&".join([f"{k}={v}" for k, v in sorted_params])
    
    # Adicionar app_secret
    string_to_sign = param_string + app_secret
    
    # Gerar MD5
    signature = hashlib.md5(string_to_sign.encode('utf-8')).hexdigest().upper()
    
    return signature

def get_oauth_url():
    """Gerar URL de autorização OAuth2"""
    params = {
        'response_type': 'code',
        'client_id': APP_KEY,
        'redirect_uri': OAUTH_REDIRECT_URI,
        'state': 'mercadodasophia_state',
        'scope': 'read'
    }
    
    query_string = urllib.parse.urlencode(params)
    return f"{OAUTH_AUTH_URL}?{query_string}"

def exchange_code_for_token(auth_code):
    """Trocar código de autorização por token"""
    global access_token, refresh_token
    
    try:
        # Parâmetros corretos para API AliExpress OAuth2 (documentação oficial)
        data = {
            'grant_type': 'authorization_code',
            'client_id': APP_KEY,
            'client_secret': APP_SECRET,
            'code': auth_code,
            'redirect_uri': OAUTH_REDIRECT_URI
        }
        
        print(f"🔄 Trocando código por token...")
        print(f"📊 Dados: {data}")
        
        # Headers corretos para API AliExpress
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'MercadoDaSophia/1.0'
        }
        
        # URL correta para OAuth2 AliExpress
        oauth_url = "https://api-sg.aliexpress.com/oauth/token"
        
        response = requests.post(oauth_url, data=data, headers=headers)
        
        print(f"📡 Status: {response.status_code}")
        print(f"📄 Resposta: {response.text}")
        
        if response.status_code == 200:
            try:
                token_data = response.json()
                access_token = token_data.get('access_token')
                refresh_token = token_data.get('refresh_token')
                
                print(f"✅ Tokens obtidos com sucesso!")
                print(f"🔑 Access Token: {access_token[:20] if access_token else 'N/A'}...")
                print(f"🔄 Refresh Token: {refresh_token[:20] if refresh_token else 'N/A'}...")
                
                return True
            except json.JSONDecodeError as e:
                print(f"❌ Erro ao fazer parse da resposta JSON: {e}")
                print(f"📄 Resposta completa: {response.text}")
                return False
        else:
            print(f"❌ Erro ao obter tokens: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Erro ao trocar código por token: {e}")
        traceback.print_exc()
        return False

def refresh_access_token():
    """Renovar access token usando refresh token"""
    global access_token, refresh_token
    
    if not refresh_token:
        return False
        
    try:
        data = {
            'grant_type': 'refresh_token',
            'client_id': APP_KEY,
            'client_secret': APP_SECRET,
            'refresh_token': refresh_token
        }
        
        response = requests.post(OAUTH_TOKEN_URL, data=data)
        
        if response.status_code == 200:
            token_data = response.json()
            access_token = token_data.get('access_token')
            refresh_token = token_data.get('refresh_token', refresh_token)
            
            print(f"✅ Access token renovado!")
            return True
        else:
            print(f"❌ Erro ao renovar token: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Erro ao renovar token: {e}")
        return False

def call_aliexpress_api(method, params):
    """Chamar API oficial do AliExpress com OAuth2"""
    global access_token
    
    if not access_token:
        print("❌ Access token não disponível. Faça OAuth2 primeiro.")
        return None
    
    try:
        # Parâmetros básicos
        base_params = {
            'method': method,
            'access_token': access_token,
            'format': 'json',
            'v': '2.0',
            'timestamp': str(int(time.time())),
            'tracking_id': TRACKING_ID
        }
        
        # Adicionar parâmetros específicos
        base_params.update(params)
        
        print(f"🔍 Chamando API: {method}")
        print(f"📊 Parâmetros: {base_params}")
        
        # Fazer requisição
        response = requests.post(API_BASE_URL, data=base_params)
        
        print(f"📡 Status: {response.status_code}")
        print(f"📄 Resposta: {response.text[:500]}...")
        
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 401:
            # Token expirado, tentar renovar
            print("🔄 Token expirado, tentando renovar...")
            if refresh_access_token():
                # Tentar novamente com novo token
                base_params['access_token'] = access_token
                response = requests.post(API_BASE_URL, data=base_params)
                if response.status_code == 200:
                    return response.json()
            
            return None
        else:
            print(f"❌ Erro na API AliExpress: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Erro ao chamar API AliExpress: {e}")
        traceback.print_exc()
        return None

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'success': True,
        'message': 'API AliExpress Dropshipping funcionando!',
        'app_key_configured': bool(APP_KEY),
        'app_secret_configured': bool(APP_SECRET),
        'tracking_id_configured': bool(TRACKING_ID),
        'api_base_url': API_BASE_URL,
        'oauth_configured': bool(OAUTH_REDIRECT_URI),
        'access_token_available': bool(access_token)
    })

@app.route('/oauth/authorize', methods=['GET'])
def oauth_authorize():
    """Iniciar fluxo OAuth2"""
    auth_url = get_oauth_url()
    return jsonify({
        'success': True,
        'auth_url': auth_url,
        'message': 'Acesse a URL para autorizar a aplicação'
    })

@app.route('/oauth/callback', methods=['GET'])
def oauth_callback():
    """Callback OAuth2"""
    auth_code = request.args.get('code')
    state = request.args.get('state')
    
    if not auth_code:
        return jsonify({
            'success': False,
            'error': 'Código de autorização não fornecido'
        }), 400
    
    if exchange_code_for_token(auth_code):
        return jsonify({
            'success': True,
            'message': 'OAuth2 autorizado com sucesso!',
            'access_token_available': bool(access_token)
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Erro ao obter tokens OAuth2'
        }), 500

@app.route('/api/aliexpress/products', methods=['GET'])
def get_products():
    """Buscar produtos do AliExpress para dropshipping"""
    if not access_token:
        return jsonify({
            'success': False,
            'error': 'OAuth2 não autorizado. Faça autorização primeiro.',
            'auth_url': get_oauth_url()
        }), 401
    
    try:
        # Parâmetros da requisição
        keywords = request.args.get('keywords', '')
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 20))
        max_price = request.args.get('max_price')
        min_price = request.args.get('min_price')
        ship_to_country = request.args.get('ship_to_country', 'BR')

        # Parâmetros para API AliExpress
        params = {
            'keywords': keywords,
            'page_no': str(page),
            'page_size': str(page_size),
            'ship_to_country': ship_to_country,
            'sort': 'SALE_PRICE_ASC'
        }
        
        if max_price:
            params['max_sale_price'] = str(int(float(max_price) * 100))
        if min_price:
            params['min_sale_price'] = str(int(float(min_price) * 100))

        # Chamar API AliExpress
        result = call_aliexpress_api('aliexpress.ds.product.search', params)
        
        if result and 'result' in result:
            products_data = result['result']
            products = []
            
            if 'products' in products_data:
                for product in products_data['products']:
                    products.append({
                        'id': product.get('product_id', ''),
                        'title': product.get('product_title', ''),
                        'price': float(product.get('target_sale_price', 0)) / 100,
                        'original_price': float(product.get('target_original_price', 0)) / 100 if product.get('target_original_price') else None,
                        'image': product.get('product_main_image_url', ''),
                        'url': product.get('promotion_link', ''),
                        'rating': product.get('evaluate_rate'),
                        'reviews_count': product.get('evaluate_rate'),
                        'sales_count': product.get('sale_price'),
                        'store_name': product.get('shop_name'),
                        'shipping': product.get('logistics_cost'),
                        'aliexpress_id': product.get('product_id', '')
                    })
            
            return jsonify({
                'success': True,
                'products': products,
                'total': products_data.get('total_record_count', len(products)),
                'current_page': page,
                'page_size': page_size
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Erro ao buscar produtos na API AliExpress',
                'response': result
            }), 500

    except Exception as e:
        print(f"❌ Erro ao buscar produtos: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/aliexpress/products/details', methods=['GET'])
def get_product_details():
    """Buscar detalhes de produtos específicos"""
    if not access_token:
        return jsonify({
            'success': False,
            'error': 'OAuth2 não autorizado. Faça autorização primeiro.',
            'auth_url': get_oauth_url()
        }), 401
    
    try:
        product_ids = request.args.get('product_ids', '')
        if not product_ids:
            return jsonify({
                'success': False,
                'error': 'IDs dos produtos não fornecidos'
            }), 400

        # Parâmetros para API AliExpress
        params = {
            'product_ids': product_ids
        }

        # Chamar API AliExpress
        result = call_aliexpress_api('aliexpress.ds.product.details', params)
        
        if result and 'result' in result:
            product_data = result['result']
            
            product = {
                'id': product_data.get('product_id', ''),
                'title': product_data.get('product_title', ''),
                'price': float(product_data.get('target_sale_price', 0)) / 100,
                'original_price': float(product_data.get('target_original_price', 0)) / 100 if product_data.get('target_original_price') else None,
                'image': product_data.get('product_main_image_url', ''),
                'url': product_data.get('promotion_link', ''),
                'rating': product_data.get('evaluate_rate'),
                'reviews_count': product_data.get('evaluate_rate'),
                'sales_count': product_data.get('sale_price'),
                'store_name': product_data.get('shop_name'),
                'shipping': product_data.get('logistics_cost'),
                'aliexpress_id': product_data.get('product_id', ''),
                'description': product_data.get('product_description', ''),
                'images': product_data.get('product_images', []),
                'specifications': product_data.get('product_specifications', {})
            }
            
            return jsonify({
                'success': True,
                'product': product
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Erro ao buscar detalhes do produto na API AliExpress',
                'response': result
            }), 500

    except Exception as e:
        print(f"❌ Erro ao buscar detalhes do produto: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/aliexpress/categories', methods=['GET'])
def get_categories():
    """Buscar categorias do AliExpress"""
    if not access_token:
        return jsonify({
            'success': False,
            'error': 'OAuth2 não autorizado. Faça autorização primeiro.',
            'auth_url': get_oauth_url()
        }), 401
    
    try:
        # Parâmetros para API AliExpress
        params = {}

        # Chamar API AliExpress
        result = call_aliexpress_api('aliexpress.ds.category.list', params)
        
        if result and 'result' in result:
            categories_data = result['result']
            categories = []
            
            if 'categories' in categories_data:
                for category in categories_data['categories']:
                    categories.append({
                        'id': category.get('category_id', ''),
                        'name': category.get('category_name', ''),
                        'level': category.get('level', 1),
                        'parent_id': category.get('parent_category_id')
                    })
            
            return jsonify({
                'success': True,
                'categories': categories
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Erro ao buscar categorias na API AliExpress',
                'response': result
            }), 500

    except Exception as e:
        print(f"❌ Erro ao buscar categorias: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/aliexpress/hot-products', methods=['GET'])
def get_hot_products():
    """Buscar produtos em alta para dropshipping"""
    if not access_token:
        return jsonify({
            'success': False,
            'error': 'OAuth2 não autorizado. Faça autorização primeiro.',
            'auth_url': get_oauth_url()
        }), 401
    
    try:
        # Parâmetros da requisição
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('page_size', 20))

        # Parâmetros para API AliExpress
        params = {
            'page_no': str(page),
            'page_size': str(page_size),
            'sort': 'SALE_PRICE_ASC'
        }

        # Chamar API AliExpress
        result = call_aliexpress_api('aliexpress.ds.hot.products', params)
        
        if result and 'result' in result:
            products_data = result['result']
            products = []
            
            if 'products' in products_data:
                for product in products_data['products']:
                    products.append({
                        'id': product.get('product_id', ''),
                        'title': product.get('product_title', ''),
                        'price': float(product.get('target_sale_price', 0)) / 100,
                        'original_price': float(product.get('target_original_price', 0)) / 100 if product.get('target_original_price') else None,
                        'image': product.get('product_main_image_url', ''),
                        'url': product.get('promotion_link', ''),
                        'rating': product.get('evaluate_rate'),
                        'reviews_count': product.get('evaluate_rate'),
                        'sales_count': product.get('sale_price'),
                        'store_name': product.get('shop_name'),
                        'shipping': product.get('logistics_cost'),
                        'aliexpress_id': product.get('product_id', '')
                    })
            
            return jsonify({
                'success': True,
                'products': products,
                'total': products_data.get('total_record_count', len(products)),
                'current_page': page,
                'page_size': page_size
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Erro ao buscar produtos em alta na API AliExpress',
                'response': result
            }), 500

    except Exception as e:
        print(f"❌ Erro ao buscar produtos em alta: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 API ALIEXPRESS OFICIAL com OAuth2 iniciando na porta {port}...")
    print(f"🔑 App Key configurado: {'✅' if APP_KEY else '❌'}")
    print(f"🔐 App Secret configurado: {'✅' if APP_SECRET else '❌'}")
    print(f"📊 Tracking ID: {TRACKING_ID}")
    print(f"🌐 API Base URL: {API_BASE_URL}")
    print(f"🔗 OAuth Redirect URI: {OAUTH_REDIRECT_URI}")
    app.run(host='0.0.0.0', port=port, debug=True)
