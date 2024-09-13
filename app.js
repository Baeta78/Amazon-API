const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

// Carregar variáveis de ambiente
const { ACCESS_KEY_ID, SECRET_ACCESS_KEY, PARTNER_TAG, PORT } = process.env;

const app = express();
app.use(express.json());

// Função auxiliar para gerar a chave de assinatura
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = sign(`AWS4${key}`, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  const kSigning = sign(kService, 'aws4_request');
  return kSigning;
}

// Função para criar a assinatura
function createSignature(method, canonicalUri, canonicalQueryString, payload, host, region, service) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substr(0, 8);

  const canonicalHeaders = `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems\n`;

  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const signingKey = getSignatureKey(SECRET_ACCESS_KEY, dateStamp, region, service);

  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `${algorithm} Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorizationHeader, amzDate };
}

// Função para fazer a chamada à API da Amazon
async function fetchAmazonData(itemIds) {
  const method = 'POST';
  const canonicalUri = '/paapi5/getitems';
  const canonicalQueryString = '';

  // Lista completa de recursos solicitados
  const resources = [
    'BrowseNodeInfo.BrowseNodes', 'BrowseNodeInfo.BrowseNodes.Ancestor', 'BrowseNodeInfo.BrowseNodes.SalesRank', 'BrowseNodeInfo.WebsiteSalesRank',
    'Images.Primary.Small', 'Images.Primary.Medium', 'Images.Primary.Large',
    'Images.Variants.Small', 'Images.Variants.Medium', 'Images.Variants.Large',
    'ItemInfo.ByLineInfo', 'ItemInfo.Classifications', 'ItemInfo.ContentInfo', 'ItemInfo.ContentRating',
    'ItemInfo.ExternalIds', 'ItemInfo.Features', 'ItemInfo.ManufactureInfo', 'ItemInfo.ProductInfo',
    'ItemInfo.TechnicalInfo', 'ItemInfo.Title', 'ItemInfo.TradeInInfo',
    'Offers.Listings.Availability.MaxOrderQuantity', 'Offers.Listings.Availability.Message',
    'Offers.Listings.Availability.MinOrderQuantity', 'Offers.Listings.Availability.Type',
    'Offers.Listings.Condition', 'Offers.Listings.Condition.ConditionNote', 'Offers.Listings.Condition.SubCondition',
    'Offers.Listings.DeliveryInfo.IsAmazonFulfilled', 'Offers.Listings.DeliveryInfo.IsFreeShippingEligible',
    'Offers.Listings.DeliveryInfo.IsPrimeEligible', 'Offers.Listings.IsBuyBoxWinner',
    'Offers.Listings.LoyaltyPoints.Points', 'Offers.Listings.MerchantInfo',
    'Offers.Listings.Price', 'Offers.Listings.ProgramEligibility.IsPrimeExclusive', 'Offers.Listings.ProgramEligibility.IsPrimePantry',
    'Offers.Listings.Promotions', 'Offers.Listings.SavingBasis', 'Offers.Summaries.HighestPrice',
    'Offers.Summaries.LowestPrice', 'Offers.Summaries.OfferCount',
    'ParentASIN'
  ];

  const payload = JSON.stringify({
    PartnerTag: PARTNER_TAG,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.com.br',
    ItemIds: itemIds,
    Resources: resources
  });

  const host = 'webservices.amazon.com.br';
  const region = 'us-east-1';
  const service = 'ProductAdvertisingAPI';

  // Criar a assinatura
  const { authorizationHeader, amzDate } = createSignature(method, canonicalUri, canonicalQueryString, payload, host, region, service);

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Encoding': 'amz-1.0',
    'X-Amz-Date': amzDate,
    'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems',
    'Authorization': authorizationHeader,
    'Host': host,
  };

  try {
    // Fazer a requisição para a API da Amazon
    const response = await axios.post(`https://${host}${canonicalUri}`, payload, { headers });

    // Verificação de segurança para acessar propriedades aninhadas
    return response.data.ItemsResult.Items.map(item => ({
      title: item?.ItemInfo?.Title?.DisplayValue || 'Título não disponível',
      price: item?.Offers?.Listings?.[0]?.Price?.DisplayAmount || 'Preço não disponível',
      image: item?.Images?.Primary?.HighRes?.URL || 'Imagem não disponível',
      productUrl: item?.DetailPageURL || 'URL não disponível',
      affiliateLink: item?.DetailPageURL ? `${item.DetailPageURL}?tag=${PARTNER_TAG}` : 'Link de afiliado não disponível',
      isPrime: item?.Offers?.Listings?.[0]?.IsPrimeEligible || false,
      allData: item // Para incluir todos os dados recebidos da Amazon
    }));
  } catch (error) {
    console.error('Erro ao buscar dados:', error.response ? error.response.data : error.message);
    return [];
  }
}

// Rota que receberá o webhook com os itemIds
app.post('/webhook', async (req, res) => {
  const { itemIds } = req.body;

  if (!itemIds || !Array.isArray(itemIds)) {
    return res.status(400).json({ error: 'itemIds inválido ou não fornecido' });
  }

  try {
    const itemsData = await fetchAmazonData(itemIds);
    res.json({ items: itemsData });
  } catch (error) {
    console.error('Erro ao processar o webhook:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Iniciar o servidor para escutar o webhook
const port = PORT || 4000;
app.listen(port, () => {
  console.log(`Servidor escutando na porta ${port}`);
});
