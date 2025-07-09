export default {
  async fetch(request, env, ctx) {
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);
    
    // Configurable TTL from environment variable
    const CACHE_TTL_MINUTES = parseInt(env.CACHE_TTL_MINUTES, 10) || 60; // Default 60 minutes
    const CACHE_TTL = CACHE_TTL_MINUTES * 60 * 1000; // Worker cache TTL in milliseconds
    const CACHE_TTL_SECONDS = CACHE_TTL_MINUTES * 60; // Edge cache TTL in seconds
    
    // Try to get response from cache first
    let cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      try {
        const cachedData = await cachedResponse.json();
        const cacheAge = Date.now() - cachedData.timestamp;
        
        if (cacheAge < CACHE_TTL) {
          console.log(`Cache hit! Age: ${Math.floor(cacheAge / 1000)}s, TTL: ${CACHE_TTL_MINUTES}min`);
          return new Response(JSON.stringify(cachedData), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
              'Expires': new Date(Date.now() + CACHE_TTL).toUTCString(),
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
              'X-Cache': 'HIT',
              'X-Cache-Age': Math.floor(cacheAge / 1000),
              'X-Cache-TTL': CACHE_TTL_MINUTES
            }
          });
        } else {
          console.log(`Cache expired - Age: ${Math.floor(cacheAge / 1000)}s, TTL: ${CACHE_TTL_MINUTES}min`);
          // Clean up expired cache entry
          ctx.waitUntil(cache.delete(cacheKey));
        }
      } catch (error) {
        console.log('Cache data corrupted, fetching fresh');
        ctx.waitUntil(cache.delete(cacheKey));
      }
    }
    
    console.log(`Cache miss - fetching from APIs (TTL: ${CACHE_TTL_MINUTES}min)`);
    
    try {
      // Fetch all data concurrently with error handling for ALL APIs
      const [
        historicalCycleData,
        currentStakingData,
        homeData,
        dalHistoryData,
        burnedSupplyData,
        totalAccountsData,
        etherlinkAccountsData,
        etherlinkTxnsData,
        tezosTransactionsData
      ] = await Promise.all([
        fetch('https://kukai.api.tzkt.io/v1/statistics/cyclic?limit=10000')
          .then(r => r.json())
          .catch(err => {
            console.error('Historical cycle data API failed:', err);
            return [];
          }),
        fetch('https://api.tzkt.io/v1/statistics/?sort.desc=level&limit=1')
          .then(r => r.json())
          .catch(err => {
            console.error('Current staking data API failed:', err);
            return [];
          }),
        fetch('https://back.tzkt.io/v1/home?quote=usd')
          .then(r => r.json())
          .catch(err => {
            console.error('Home data API failed:', err);
            return {};
          }),
        fetch('https://dal-o-meter.tezos.com/api/history')
          .then(r => r.json())
          .catch(err => {
            console.error('DAL history API failed:', err);
            return [];
          }),
        fetch('https://stats.dipdup.net/v1/histogram/balance_update/sum/month?field=Update&Kind=2&size=1000')
          .then(r => r.json())
          .catch(err => {
            console.error('Burned supply API failed:', err);
            return [];
          }),
        fetch('https://stats.dipdup.net/v1/histogram/accounts_stats/max/week?field=Total&size=1000')
          .then(r => r.json())
          .catch(err => {
            console.error('Total accounts API failed:', err);
            return [];
          }),
        fetch('https://explorer.etherlink.com/stats-service/api/v1/lines/accountsGrowth?resolution=DAY')
          .then(r => r.json())
          .catch(err => {
            console.error('Etherlink accounts API failed:', err);
            return { chart: [] };
          }),
        fetch('https://explorer.etherlink.com/stats-service/api/v1/lines/txnsGrowth?resolution=DAY')
          .then(r => r.json())
          .catch(err => {
            console.error('Etherlink transactions API failed:', err);
            return { chart: [] };
          }),
        fetch('https://stats.dipdup.net/v1/histogram/transactions/count/month?size=1000')
          .then(r => r.json())
          .catch(err => {
            console.error('Tezos transactions API failed:', err);
            return [];
          })
      ]);

      // Process other data as before
      let processedEtherlinkData = [];
      if (etherlinkAccountsData.chart && etherlinkAccountsData.chart.length > 0) {
        processedEtherlinkData = etherlinkAccountsData.chart.map(item => [
          new Date(item.date).getTime(),
          parseInt(item.value)
        ]);
      }

      // Process burned supply data
      let processedBurnedSupply = [];
      if (burnedSupplyData.length > 0) {
        let cumulativeSum = 0;
        burnedSupplyData.reverse().forEach(item => {
          const value = Math.abs(parseInt(item.value) / 1000000);
          cumulativeSum += value;
          cumulativeSum = parseFloat(cumulativeSum.toFixed(6));
          processedBurnedSupply.push([new Date(item.ts * 1000).getTime(), cumulativeSum]);
        });
        processedBurnedSupply.reverse();
      }

      // Process total accounts data
      let processedAccountsData = [];
      if (totalAccountsData.length > 0) {
        processedAccountsData = totalAccountsData
          .reverse()
          .map(item => [new Date(item.ts * 1000).getTime(), Math.abs(parseInt(item.value))]);
        processedAccountsData.reverse();
      }

      let processedEtherlinkTxns = [];
      if (etherlinkTxnsData.chart && etherlinkTxnsData.chart.length > 0) {
        processedEtherlinkTxns = etherlinkTxnsData.chart.map(item => [
          new Date(item.date).getTime(),
          parseInt(item.value)
        ]);
      }

      // Process Tezos transactions data
      let processedTezosTransactions = [];
      if (tezosTransactionsData.length > 0) {
        processedTezosTransactions = tezosTransactionsData
          .reverse()
          .map(item => [new Date(item.ts * 1000).getTime(), Math.abs(parseInt(item.value))]);
        processedTezosTransactions.reverse();
      }

      // Calculate current staking ratio with fallback
      const currentStakingRatio = (currentStakingData.length > 0 && currentStakingData[0].totalSupply) ? 
        currentStakingData[0].totalFrozen / currentStakingData[0].totalSupply : 0;

      // Aggregate all data with timestamp
      const aggregatedData = {
        historicalCycleData,
        currentStakingRatio,
        homeData,
        dalHistoryData: dalHistoryData.reverse ? dalHistoryData.reverse() : dalHistoryData,
        burnedSupplyData: processedBurnedSupply,
        totalAccountsData: processedAccountsData,
        etherlinkAccountsData: processedEtherlinkData,
        etherlinkTxnsData: processedEtherlinkTxns,
        tezosTransactionsData: processedTezosTransactions,
        timestamp: Date.now() // Critical for TTL checking
      };

      // Create response with configurable cache headers
      const responseData = new Response(JSON.stringify(aggregatedData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
          'Expires': new Date(Date.now() + CACHE_TTL).toUTCString(),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'X-Cache': 'MISS',
          'X-Cache-TTL': CACHE_TTL_MINUTES
        }
      });

      // Store in cache with configurable TTL
      ctx.waitUntil(cache.put(cacheKey, responseData.clone()));

      return responseData;

    } catch (error) {
      console.error('Error fetching data:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch data',
        message: error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
}
