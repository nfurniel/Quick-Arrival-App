const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function testApi() {
  console.log("Fetching Stop Times for 8_06032...");
  const timesUrl = "https://www.crtm.es/widgets/api/GetStopsTimes.php?codStop=8_06032&type=0&orderBy=2&stopTimesByIti=8_06032";
  const times = await fetchJson(timesUrl);
  
  if (!times || !times.stopTimes || !times.stopTimes.times || !times.stopTimes.times.Time) {
    console.log("No times found:", times);
    return;
  }
  
  let timesArray = times.stopTimes.times.Time;
  if (!Array.isArray(timesArray)) timesArray = [timesArray];
  
  const first = timesArray[0];
  console.log("First bus data:");
  console.log({
    codLine: first.line.codLine,
    direction: first.direction,
    destination: first.destination
  });
  
  // Try GetLineLocation
  console.log("\nFetching GetLineLocation...");
  const mode = first.line.codMode || 8;
  const codLine = first.line.codLine;
  const direction = first.direction;
  const codStop = "8_06032";
  
  // We don't have codItinerary. Let's try to leave it empty or guess it
  let locUrl = `https://www.crtm.es/widgets/api/GetLineLocation.php?mode=${mode}&codLine=${codLine}&codStop=${codStop}&direction=${direction}&codItinerary=`;
  console.log("URL:", locUrl);
  
  const locRaw = await fetchJson(locUrl);
  console.log("Location Response:", JSON.stringify(locRaw, null, 2));
}

testApi();
