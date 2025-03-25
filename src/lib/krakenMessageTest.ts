import { parseKrakenMessage } from './kraken';

// Test the WebSocket message parsing with the example message
export function testKrakenMessageParsing() {
  const exampleMessage = `{
    "data": "{\\\"channel\\\":\\\"ticker\\\",\\\"type\\\":\\\"update\\\",\\\"data\\\":[{\\\"symbol\\\":\\\"ADA/USD\\\",\\\"bid\\\":0.737343,\\\"bid_qty\\\":6069.43957190,\\\"ask\\\":0.737458,\\\"ask_qty\\\":14.91725035,\\\"last\\\":0.737343,\\\"volume\\\":29989321.04199265,\\\"vwap\\\":0.735856}]}",
    "timestamp": 1742852658991
  }`;

  console.log('Testing Kraken message parsing with example message:');
  console.log(exampleMessage);
  
  const prices = parseKrakenMessage(exampleMessage);
  
  console.log('Parsed prices:');
  console.log(JSON.stringify(prices, null, 2));
  
  return prices;
}

// Run the test
testKrakenMessageParsing();