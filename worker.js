export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = '/';
    cacheUrl.search = '';
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
    
    // Configurable TTL from environment variable
    const CACHE_TTL_MINUTES = 60;
    const CACHE_TTL = CACHE_TTL_MINUTES * 60 * 1000;
    const CACHE_TTL_SECONDS = CACHE_TTL_MINUTES * 60;
    
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
              ...corsHeaders,
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
        homeData,
        dalHistoryData,
        dailyStatsData,
        totalAccountsData,
        etherlinkAccountsData,
        etherlinkTxnsData,
        tezosTransactionsData,
        etherlinkDefiLlamaData,
        tezosDefiLlamaData,
        bakersData,
        ecosystemData,
        consensusKeyUpdates,
        activeDelegates
      ] = await Promise.all([
        fetch('https://kukai.api.tzkt.io/v1/statistics/cyclic?limit=10000')
          .then(r => r.json())
          .catch(err => {
            console.error('Historical cycle data API failed:', err);
            return [];
          }),
          fetch('https://api.tzkt.io/v1/home')
          .then(r => r.json())
          .then(data => {
            // Remove totalDalBakers key recursively
            const removeKey = (obj, keyToRemove) => {
              if (Array.isArray(obj)) {
                return obj.map(item => removeKey(item, keyToRemove));
              } else if (obj !== null && typeof obj === 'object') {
                return Object.keys(obj).reduce((acc, key) => {
                  if (key !== keyToRemove) {
                    acc[key] = removeKey(obj[key], keyToRemove);
                  }
                  return acc;
                }, {});
              }
              return obj;
            };
            
            return removeKey(data, 'totalDalBakers');
          })
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
        fetch('https://api.tzkt.io/v1/statistics/daily?limit=10000')
          .then(r => r.json())
          .catch(err => {
            console.error('Daily stats API failed:', err);
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
          }),
        fetch('https://defillama.com/chain/etherlink',{
          headers: {
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://defillama.com/etherlink'
           }
        })
        .then(r => r.text())
        .then(html => {
          const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
          if (match) {
            const data = JSON.parse(match[1]);
            return {
              tvlChart: data.props.pageProps.tvlChart || [],
              protocols: data.props.pageProps.protocols || []
            };
          }
          return { tvlChart: [], protocols: [] };
        })
        .catch(err => {
          console.error('Etherlink DeFiLlama API failed:', err);
          return { tvlChart: [], protocols: [] };
        }),
        fetch('https://defillama.com/chain/tezos',{
          headers: {
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://defillama.com/tezos'
           }
        })
        .then(r => r.text())
        .then(html => {
          const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
          if (match) {
            const data = JSON.parse(match[1]);
            return {
              tvlChart: data.props.pageProps.tvlChart || [],
              protocols: data.props.pageProps.protocols || []
            };
          }
          return { tvlChart: [], protocols: [] };
        })
        .catch(err => {
          console.error('Tezos DeFiLlama API failed:', err);
          return { tvlChart: [], protocols: [] };
        }),
        fetch('https://api.baking-bad.org/v3/bakers')
          .then(r => r.json())
          .catch(err => {
            console.error('Bakers API failed:', err);
            return [];
          }),
        fetch('https://tez.cool/ecosystem.json')
          .then(r => r.json())
          .catch(err => {
            console.error('Ecosystem API failed:', err);
            return { ecosystem: [] };
          }),
        fetch('https://api.tzkt.io/v1/operations/update_secondary_key?key_type=consensus&status=applied&limit=10000&select=sender,publicKeyHash,level,activationCycle')
          .then(r => r.json())
          .catch(err => {
            console.error('Consensus key updates API failed:', err);
            return [];
          }),
        fetch('https://api.tzkt.io/v1/delegates?select=address&active=true&limit=10000')
          .then(r => r.json())
          .catch(err => {
            console.error('Active delegates API failed:', err);
            return [];
          })
      ]);

      // Merge TVL charts from both chains
      const mergedTvlChart = {};
      [etherlinkDefiLlamaData.tvlChart, tezosDefiLlamaData.tvlChart].forEach(chart => {
        chart.forEach(([timestamp, value]) => {
          mergedTvlChart[timestamp] = (mergedTvlChart[timestamp] || 0) + value;
        });
      });
      const combinedTvlChart = Object.entries(mergedTvlChart).map(([ts, val]) => [parseInt(ts)*1000, val]);

      // Process TVL data from DeFiLlama protocols
      const processedTvlData = {
        series: [{
          values: [[], []] // [names, tvl_values]
        }]
      };

      // Combine protocols from both Tezos and Etherlink
      const allProtocols = [
        ...tezosDefiLlamaData.protocols.map(p => ({ ...p, chain: 'Tezos L1' })),
        ...etherlinkDefiLlamaData.protocols.map(p => ({ ...p, chain: 'Etherlink' }))
      ];

      // Extract name and TVL from protocols
      allProtocols.forEach(protocol => {
        if (protocol.tvl && protocol.tvl.default && protocol.tvl.default.tvl > 0) {
          processedTvlData.series[0].values[0].push(protocol.name);
          processedTvlData.series[0].values[1].push(Math.floor(protocol.tvl.default.tvl));
        }
      });

      // Process other data as before
      let processedEtherlinkData = [];
      if (etherlinkAccountsData.chart && etherlinkAccountsData.chart.length > 0) {
        processedEtherlinkData = etherlinkAccountsData.chart.map(item => [
          new Date(item.date).getTime(),
          parseInt(item.value)
        ]);
      }

      // Process burned supply data from daily stats (totalBurned + totalBanished)
      // Downsample to monthly (last entry per month) and reverse to newest-first
      let processedBurnedSupply = [];
      if (dailyStatsData.length > 0) {
        const monthlyMap = {};
        dailyStatsData.forEach(item => {
          const d = new Date(item.timestamp);
          const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
          monthlyMap[key] = item; // last entry per month wins (data is oldest-first)
        });
        processedBurnedSupply = Object.values(monthlyMap)
          .map(item => [
            new Date(item.timestamp).getTime(),
            (item.totalBurned + item.totalBanished) / 1000000
          ])
          .sort((a, b) => b[0] - a[0]); // newest-first
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

      // Derive current staking ratio from last cyclic data entry (eliminates separate API call)
      const lastCycleEntry = historicalCycleData.length > 0
        ? historicalCycleData[historicalCycleData.length - 1]
        : null;
      const currentStakingRatio = (lastCycleEntry && lastCycleEntry.totalSupply)
        ? lastCycleEntry.totalFrozen / lastCycleEntry.totalSupply
        : 0;

      // Process consensus key adoption data
      let consensusKeyAdoptionData = [];
      
      if (consensusKeyUpdates.length > 0 && activeDelegates.length > 0) {
        // Create a set of active delegate addresses for quick lookup
        const activeDelegateAddresses = new Set(activeDelegates);
        
        // Find the latest update for each address
        const latestUpdatesByAddress = {};
        consensusKeyUpdates.forEach(update => {
          // sender can be either a string or an object with address/alias
          const address = typeof update.sender === 'string' ? update.sender : (update.sender?.address || null);
          if (!address) return;
          
          // Only consider if address is an active delegate
          if (!activeDelegateAddresses.has(address)) return;
          
          const currentLatest = latestUpdatesByAddress[address];
          if (!currentLatest || update.level > currentLatest.level) {
            latestUpdatesByAddress[address] = update;
          }
        });
        
        // Group by activation cycle and count tz4 adoptions
        const cycleData = {};
        Object.values(latestUpdatesByAddress).forEach(update => {
          const cycle = update.activationCycle;
          if (!cycle) return;
          
          if (!cycleData[cycle]) {
            cycleData[cycle] = { total: 0, tz4: 0 };
          }
          
          cycleData[cycle].total++;
          if (update.publicKeyHash && update.publicKeyHash.startsWith('tz4')) {
            cycleData[cycle].tz4++;
          }
        });
        
        // Calculate cumulative percentages
        let cumulativeTz4 = 0;
        let cumulativeTotal = 0;
        const totalDelegates = activeDelegates.length;
        
        consensusKeyAdoptionData = Object.keys(cycleData)
          .map(Number)
          .sort((a, b) => a - b)
          .map(cycle => {
            cumulativeTz4 += cycleData[cycle].tz4;
            cumulativeTotal += cycleData[cycle].total;
            
            // Calculate percentage of all delegates that have adopted tz4
            const percentage = (cumulativeTz4 / totalDelegates);
            
            return {
              cycle: cycle,
              tz4_adoption_percentage: percentage
            };
          });
      }

      // Aggregate all data with timestamp
      const aggregatedData = {
        historicalCycleData,
        currentStakingRatio,
        homeData,
        combinedTvlChart,
        dalHistoryData: dalHistoryData.reverse ? dalHistoryData.reverse() : dalHistoryData,
        burnedSupplyData: processedBurnedSupply,
        totalAccountsData: processedAccountsData,
        etherlinkAccountsData: processedEtherlinkData,
        etherlinkTxnsData: processedEtherlinkTxns,
        tezosTransactionsData: processedTezosTransactions,
        tvlData: processedTvlData,
        bakers: bakersData,
        ecosystemProjects: ecosystemData.ecosystem || [],
        consensusKeyAdoptionData: consensusKeyAdoptionData,
        timestamp: Date.now()
      };

      // Create response with configurable cache headers
      const responseData = new Response(JSON.stringify(aggregatedData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
          'Expires': new Date(Date.now() + CACHE_TTL).toUTCString(),
          ...corsHeaders,
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
