import os
import hashlib
import hmac
import requests
import datetime
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import json

# Carregar variáveis de ambiente do arquivo .env
load_dotenv()

app = Flask(__name__)

ACCESS_KEY_ID = os.getenv('ACCESS_KEY_ID')
SECRET_ACCESS_KEY = os.getenv('SECRET_ACCESS_KEY')
PARTNER_TAG = os.getenv('PARTNER_TAG')
PORT = int(os.getenv('PORT', 4000))

# Função para gerar a assinatura AWS v4
def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, 'aws4_request')
    return k_signing

def create_signed_headers(payload, host, region, service):
    amz_date = datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    date_stamp = datetime.datetime.utcnow().strftime('%Y%m%d')

    # Payload convertido para JSON e gerado o hash SHA-256
    payload_json = json.dumps(payload)
    payload_hash = hashlib.sha256(payload_json.encode('utf-8')).hexdigest()

    canonical_headers = f'host:{host}\n'
    signed_headers = 'host'

    # Criação do canonical request
    canonical_request = f'POST\n/paapi5/getitems\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}'
    credential_scope = f'{date_stamp}/{region}/{service}/aws4_request'

    # String para assinar
    string_to_sign = f'AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()}'
    signing_key = get_signature_key(SECRET_ACCESS_KEY, date_stamp, region, service)

    # Geração da assinatura
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

    # Cabeçalhos de autorização
    authorization_header = f'AWS4-HMAC-SHA256 Credential={ACCESS_KEY_ID}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}'

    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Amz-Date': amz_date,
        'Authorization': authorization_header,
        'Host': host,
    }

    return headers

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    item_ids = data.get('itemIds')

    if not item_ids:
        return jsonify({'error': 'itemIds inválido ou não fornecido'}), 400

    payload = {
        "PartnerTag": PARTNER_TAG,
        "PartnerType": "Associates",
        "Marketplace": "www.amazon.com.br",
        "ItemIds": item_ids,
        "Resources": ["Images.Primary.Medium", "ItemInfo.Title", "Offers.Listings.Price"]
    }

    host = 'webservices.amazon.com.br'
    region = 'us-east-1'
    service = 'ProductAdvertisingAPI'

    # Gerar cabeçalhos assinados
    headers = create_signed_headers(payload=payload, host=host, region=region, service=service)

    # Fazer a requisição
    response = requests.post(f'https://{host}/paapi5/getitems', json=payload, headers=headers)

    # Verificar a resposta
    if response.status_code == 200:
        return jsonify(response.json())
    else:
        return jsonify({'error': 'Erro ao buscar dados', 'details': response.text}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
