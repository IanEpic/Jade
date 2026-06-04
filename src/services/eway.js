// services/eway.js
// Replaces paymentcvn() from EPIC::Common
// Implements the legacy Eway CVN XML gateway (same gateway the Perl used).

import https from 'https';
import http  from 'http';
import { URL } from 'url';

// Parse a simple XML response by extracting tag values with regex.
// The Eway response is shallow enough that a full XML parser isn't needed.
function parseXml(xml) {
    const result = {};
    const re = /<(\w+)>([^<]*)<\/\1>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        result[m[1]] = m[2].trim();
    }
    return result;
}

/**
 * Process a credit card payment via the Eway CVN XML gateway.
 *
 * @param {object} opts
 * @param {string} opts.gatewayUrl   - program.ewaygatewayaddress
 * @param {string} opts.customerId   - program.ewaycustomerno
 * @param {number} opts.amountCents  - charge amount in cents (e.g. 5412 for $54.12)
 * @param {string} opts.cardName
 * @param {string} opts.cardNumber
 * @param {string} opts.cardExpiryMonth  - "01".."12"
 * @param {string} opts.cardExpiryYear   - "25" (2-digit) or "2025"
 * @param {string} opts.cvn
 * @param {string} opts.reference    - payment reference number (shown on statement)
 * @returns {Promise<object>} Parsed Eway response fields
 */
export async function ewayCharge({
    gatewayUrl, customerId, amountCents,
    cardName, cardNumber, cardExpiryMonth, cardExpiryYear,
    cvn, reference,
    firstName = '', lastName = '', email = '',
    address = '', postcode = '',
    invoiceDescription = 'Awards Entry', invoiceRef = '',
}) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ewaygateway>
  <ewayCustomerID>${customerId}</ewayCustomerID>
  <ewayTotalAmount>${Math.round(amountCents)}</ewayTotalAmount>
  <ewayCustomerFirstName>${firstName}</ewayCustomerFirstName>
  <ewayCustomerLastName>${lastName}</ewayCustomerLastName>
  <ewayCustomerEmail>${email}</ewayCustomerEmail>
  <ewayCustomerAddress>${address}</ewayCustomerAddress>
  <ewayCustomerPostcode>${postcode}</ewayCustomerPostcode>
  <ewayCustomerInvoiceDescription>${invoiceDescription}</ewayCustomerInvoiceDescription>
  <ewayCustomerInvoiceRef>${invoiceRef || reference}</ewayCustomerInvoiceRef>
  <ewayCardHoldersName>${cardName}</ewayCardHoldersName>
  <ewayCardNumber>${cardNumber}</ewayCardNumber>
  <ewayCardExpiryMonth>${cardExpiryMonth}</ewayCardExpiryMonth>
  <ewayCardExpiryYear>${cardExpiryYear}</ewayCardExpiryYear>
  <ewayCVN>${cvn}</ewayCVN>
  <ewayTrxnNumber></ewayTrxnNumber>
  <ewayOption1>${reference}</ewayOption1>
  <ewayOption2></ewayOption2>
  <ewayOption3></ewayOption3>
</ewaygateway>`;

    const parsed = new URL(gatewayUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
        const options = {
            hostname: parsed.hostname,
            port:     parsed.port || (isHttps ? 443 : 80),
            path:     parsed.pathname,
            method:   'POST',
            headers:  {
                'Content-Type':   'text/xml',
                'Content-Length': Buffer.byteLength(xml),
            },
            rejectUnauthorized: false, // Eway legacy gateway has old cert
        };

        const req = lib.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(parseXml(body));
                } catch (e) {
                    reject(new Error(`Eway XML parse error: ${e.message}\nBody: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(new Error('Eway gateway timeout')); });
        req.write(xml);
        req.end();
    });
}
