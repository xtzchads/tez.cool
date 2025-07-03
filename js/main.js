// Core constants
const TRANSITION_PERIOD = 50;
const INITIAL_PERIOD = 10;
const AI_ACTIVATION_CYCLE = 748;
const WORKER_URL = 'https://tez.cool/api/v1/getData';
let aggregatedDataCache = null;
let currentCycle, forecasted, tmp = 0, tmp1;
let totalTVL;
let specificProtocolsTVL = 0;

Highcharts.setOptions({
    chart: {
        style: {
            fontFamily: '"Monda", Helvetica, Arial, sans-serif'
        }
    },
    title: {
        style: {
            fontFamily: '"Monda", Helvetica, Arial, sans-serif'
        }
    },
    subtitle: {
        style: {
            fontFamily: '"Monda", Helvetica, Arial, sans-serif'
        }
    },
    xAxis: {
        labels: {
            style: {
                fontFamily: '"Monda", Helvetica, Arial, sans-serif'
            }
        },
        title: {
            style: {
                fontFamily: '"Monda", Helvetica, Arial, sans-serif'
            }
        }
    },
    yAxis: {
        labels: {
            style: {
                fontFamily: '"Monda", Helvetica, Arial, sans-serif'
            }
        },
        title: {
            style: {
                fontFamily: '"Monda", Helvetica, Arial, sans-serif'
            }
        }
    },
    legend: {
        itemStyle: {
            fontFamily: '"Monda", Helvetica, Arial, sans-serif'
        }
    },
    tooltip: {
        style: {
            fontFamily: '"Monda", Helvetica, Arial, sans-serif'
        }
    },
    plotoptions: {
        series: {
            dataLabels: {
                style: {
                    fontFamily: '"Monda", Helvetica, Arial, sans-serif'
                }
            }
        }
    }
});

function computeExtremum(cycle, initialValue, finalValue) {
  const initialLimit = AI_ACTIVATION_CYCLE + INITIAL_PERIOD;
  const transLimit = initialLimit + TRANSITION_PERIOD + 1;
  
  if (cycle <= initialLimit) return initialValue;
  if (cycle >= transLimit) return finalValue;
  
  const t = cycle - initialLimit;
  return (t * (finalValue - initialValue) / (TRANSITION_PERIOD + 1)) + initialValue;
}

function minimumRatio(cycle) { return computeExtremum(cycle, 0.045, 0.0025); }
function maximumRatio(cycle) { return computeExtremum(cycle, 0.055, 0.1); }
function stakedRatio(cycle, value) { return value; }
function clip(value, minValue, maxValue) { return Math.max(minValue, Math.min(value, maxValue)); }

function staticRate(cycle, value) {
  const staticRateValue = 1 / 1600 * (1 / (value ** 2));
  return clip(staticRateValue, minimumRatio(cycle), maximumRatio(cycle));
}

function applyBonus(cycle, value, targetRatio, tmp1) {
  if (cycle <= AI_ACTIVATION_CYCLE) {
    tmp = 0;
    return 0;
  }
  
  const previousBonus = tmp;
  const stakedRatioValue = tmp1;
  const ratioMax = maximumRatio(cycle + 1);
  const staticRateValue = staticRate(cycle, value);
  const staticRateDistToMax = ratioMax - staticRateValue;
  const udist = Math.max(0, Math.abs(stakedRatioValue - targetRatio) - 0.02);
  const dist = stakedRatioValue >= targetRatio ? -udist : udist;
  const maxNewBonus = Math.min(staticRateDistToMax, 0.05);
  const newBonus = previousBonus + dist * 0.01 * (cycle==858)?(245760 / 86400):1;
  const res = clip(newBonus, 0, maxNewBonus);
  
  console.assert(res >= 0 && res <= 5);
  tmp = res;
  return res;
}

function dyn(cycle, value, tmp1) {
  return applyBonus(cycle, value, 0.5, tmp1);
}


function adaptiveMaximum(r) {
  if (r >= 0.5) return 0.01;
  if (r <= 0.05) return 0.1;
  
  const y = (1 + 9 * Math.pow((50 - 100 * r) / 42, 2)) / 100;
  return clip(y, 0.01, 0.1);
}

function issuanceRateQ(cycle, value) {
  const adjustedCycle = cycle - 2;
  tmp1 = value;
  const staticRateRatio = staticRate(adjustedCycle, value);
  const bonus = dyn(adjustedCycle, value, tmp1);
  const ratioMin = minimumRatio(adjustedCycle);
  const ratioMax = cycle >= 823 ? 
    Math.min(maximumRatio(adjustedCycle), adaptiveMaximum(value)) : 
    maximumRatio(adjustedCycle);
  
  const totalRate = staticRateRatio + bonus;
  return clip(totalRate, ratioMin, ratioMax) * 100;
}

async function fetchAggregatedData() {
  try {
    const response = await fetch(WORKER_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching aggregated data:', error);
    throw error;
  }
}

function calculateIndicator(stakingRatio) {
  const indicator = 100 / (Math.exp(-2 * (stakingRatio - 0.5)));
  return parseInt(Math.min(indicator, 100));
}

function fetchHistoricalCycleData() {
  return aggregatedDataCache.historicalCycleData;
}

async function getCurrentStakingRatio() {
  return aggregatedDataCache.currentStakingRatio;
}

function calculateAverageDifference(arr) {
  return arr.reduce((sum, val, idx, array) => 
    idx > 0 ? sum + Math.abs(val - array[idx - 1]) : sum, 0) / (arr.length - 1);
}

function slowIncrement(current, avgDiff) {
  const center = 0.5;
  const scale = 6; 
  return avgDiff * 0.2 / (1 + Math.exp((Math.abs(current - center) - center) / scale));
}

function fetchHistoricalCycleData() {
  return aggregatedDataCache.historicalCycleData;
}

async function getCurrentStakingRatio() {
  return aggregatedDataCache.currentStakingRatio;
}

async function initializeRatios() {
  let ratios = [];
  let last = 0;
  try {
    aggregatedDataCache = await fetchAggregatedData();
    
    const data = aggregatedDataCache.historicalCycleData;
    currentCycle = data[data.length - 1].cycle;
    const startCycle = AI_ACTIVATION_CYCLE;
    
    const relevantData = data.filter(cycleData => cycleData.cycle >= startCycle);
    
    relevantData.forEach(cycleData => {
      const ratio = cycleData.totalFrozen / cycleData.totalSupply;
      ratios.push(ratio);
      last = ratio;
    });
    
    while (ratios.length < 500) {
      last += slowIncrement(last, calculateAverageDifference(ratios));
      ratios.push(last);
    }
    forecasted = ratios[ratios.length - 1];
    
    // Remove first (currentCycle - AI_ACTIVATION_CYCLE) elements
    const elementsToRemove = currentCycle - AI_ACTIVATION_CYCLE;
    ratios = ratios.slice(elementsToRemove);
    
    return ratios;
  } catch (error) {
    console.error('Error initializing ratios:', error);
    throw error;
  }
}

function createVerticalLine(chart, xValue) {
  const xAxis = chart.xAxis[0];
  const yAxis = chart.yAxis[0];
  
  const dataPoint = chart.series[0].data.find(point => point.x === xValue);
  if (dataPoint) {
    const xPos = xAxis.toPixels(xValue);
    const yPosTop = yAxis.toPixels(dataPoint.y);
    const yPosBottom = yAxis.toPixels(0);

    chart.renderer.path(['M', xPos, yPosTop, 'L', xPos, yPosBottom])
      .attr({
        'stroke-width': 0.5,
        stroke: '#ffffff',
      })
      .add();
  }
}

function createVerticalLines(chart, positions) {
  positions.forEach(pos => createVerticalLine(chart, pos));
}


function createPieChart(totalStakedPercentage, totalDelegatedPercentage, stakedAPY, delegatedAPY) {
  const jeetsPercentage = Number(Math.max(0, 100 - totalStakedPercentage - totalDelegatedPercentage).toFixed(2));
  
  Highcharts.chart('chart-container4', {
    chart: {
      backgroundColor: 'rgba(0,0,0,0)',
      type: 'pie'
    },
    title: {
      text: 'TezStakeMeter',
      style: { color: '#ffffff', fontSize: '24px' }
    },
    tooltip: {
      pointFormat: '<b>{point.y}%</b>'
    },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        states: {
          hover: {
            brightness: 0.1 // Slight brightness increase on hover
          }
        }
      }
    },
    series: [{
      name: 'Ratios',
      data: [
        { 
          name: 'Staked ('+stakedAPY+'% APY)', 
          y: totalStakedPercentage, 
          color: {
            radialGradient: {
              cx: 0.5,
              cy: 0.5,
              r: 0.8
            },
            stops: [
              [0, 'hsla(220, 85%, 70%, 0.9)'], // Blue gradient with transparency
              [0.5, 'hsla(220, 75%, 55%, 0.8)'],
              [1, 'hsla(220, 65%, 40%, 0.7)']
            ]
          }
        },
        { 
          name: 'Delegated ('+delegatedAPY+'% APY)', 
          y: totalDelegatedPercentage, 
          color: {
            radialGradient: {
              cx: 0.5,
              cy: 0.5,
              r: 0.8
            },
            stops: [
              [0, 'hsla(280, 85%, 70%, 0.9)'], // Purple gradient with transparency
              [0.5, 'hsla(280, 75%, 55%, 0.8)'],
              [1, 'hsla(280, 65%, 40%, 0.7)']
            ]
          }
        },
        { 
          name: 'Passive', 
          y: jeetsPercentage, 
          color: {
            radialGradient: {
              cx: 0.5,
              cy: 0.5,
              r: 0.8
            },
            stops: [
              [0, 'hsla(10, 85%, 70%, 0.9)'], // Red gradient with transparency
              [0.5, 'hsla(10, 75%, 55%, 0.8)'],
              [1, 'hsla(10, 65%, 40%, 0.7)']
            ]
          }
        }
      ],
      showInLegend: false,
      dataLabels: {
        enabled: true,
        format: '{point.name}',
        style: { 
          color: '#ffffff', 
          fontSize: '14px',
          textOutline: '1px contrast' // Better text visibility
        }
      },
      borderColor: 'rgba(255,255,255,0.2)',
      borderWidth: 2
    }],
    exporting: { enabled: false },
    credits: { enabled: false }
  });
}

function createDALSupportChart() {
  try {
    const data = aggregatedDataCache.dalHistoryData;
    
    const latestCycle = data[data.length - 1]?.cycle || currentCycle;
    
    const chartData = data.map(item => ({
      x: item.cycle,
      y: item.dal_baking_power_percentage / 100
    }));
    
    Highcharts.chart('chart-container5', {
      chart: {
        type: 'spline',
        backgroundColor: 'rgba(0,0,0,0)',
      },
      title: {
        text: 'DAL Support',
        style: { color: '#ffffff' }
      },
      xAxis: {
        lineColor: '#ffffff',
        lineWidth: 1,
        labels: { enabled: false }
      },
      yAxis: {
        gridLineWidth: 0,
        title: { text: null },
        labels: { enabled: false },
        plotLines: [{
          color: '#ffffff',
          width: 2,
          value: 0.67,
          dashStyle: 'dot',
          zIndex: 5,
          label: {
            text: 'Activation (67%)',
            align: 'left',
            style: {
              color: '#ffffff',
              fontWeight: 'bold'
            },
            x: 10,
            y: -10
          }
        }]
      },
      tooltip: {
        formatter: function() {
          return `Cycle: ${this.x}<br><span style="color:${this.point.color}">●</span> DAL Support: <b>${(this.y * 100).toFixed(2)}%</b><br/>`;
        }
      },
      series: [{
        shadow: {
          color: 'rgba(255, 255, 0, 0.7)',
          offsetX: 0, offsetY: 0,
          opacity: 1, width: 10
        },
        name: "DAL Support",
        showInLegend: false,
        data: chartData,
        dataLabels: {
          enabled: true,
          formatter: function() {
            if (this.point.index === this.series.data.length - 1) {
              return `${(this.y * 100).toFixed(2)}%`;
            }
            return null;
          },
          align: 'right',
          verticalAlign: 'bottom',
        },
        lineWidth: 3,
        marker: { enabled: false },
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#77dd77'], [1, '#ff6961']]
        }
      }],
      credits: { enabled: false }
    });
  } catch (error) {
    console.error('Error loading DAL data:', error);
  }
}

function createBurnedSupplyChart() {
  try {
    const seriesData = aggregatedDataCache.burnedSupplyData;
    createTimeSeriesChart('chart-container', 'Burned Supply', seriesData, value => `${(value / 1000000).toFixed(2)}M`);
  } catch (error) {
    console.error('Error loading burned supply data:', error);
  }
}

function recursivelyRemoveDips(data, threshold = 0.2) {
 let hasChanges = true;
 let result = [...data];
 
 while (hasChanges) {
   hasChanges = false;
   const newResult = [];
   
   for (let i = 0; i < result.length; i++) {
     if (i === 0) {
       newResult.push(result[i]);
       continue;
     }
     
     const prevValue = newResult[newResult.length - 1][1]; // Use last kept point
     const currentValue = result[i][1];
     const dipPercent = (prevValue - currentValue) / prevValue;
     
     if (dipPercent > threshold) {
       // Skip this point (remove it)
       hasChanges = true;
     } else {
       newResult.push(result[i]);
     }
   }
   
   result = newResult;
 }
 
 return result;
}

function createHistoricalTvlChart() {
  try {
    const tezosData = recursivelyRemoveDips(
 aggregatedDataCache.combinedTvlChart.filter(item => item[0] > 1655769600000),
 0.2
);
if (tezosData.length > 0) {
 tezosData[tezosData.length - 1][1] = totalTVL-specificProtocolsTVL;
}
    
    const series = [];

      series.push({
        showInLegend: false,
        shadow: {
          color: 'rgba(255, 255, 0, 0.7)',
          offsetX: 0, offsetY: 0,
          opacity: 1, width: 10
        },
        name: 'TVL',
        data: tezosData,
        dataLabels: {
          enabled: true,
          formatter: function() {
            return this.point.index === this.series.data.length-1 ? `$${(this.y / 1000000).toFixed(2)}M` : null;
          },
          align: 'right',
          verticalAlign: 'bottom',
        },
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#77dd77'], [1, '#ff6961']]
        }
      });
    

    Highcharts.chart('chart-container9', {
      chart: {
        type: 'spline',
        backgroundColor: 'rgba(0,0,0,0)'
      },
      title: {
        text: 'DeFi Growth (L1+L2-RWA)',
        style: { color: '#ffffff' }
      },
      xAxis: {
        type: 'datetime',
        lineColor: '#ffffff',
        lineWidth: 1,
        labels: {
          enabled: false,
          style: { color: '#ffffff' },
          formatter: function() {
            return Highcharts.dateFormat('%b %Y', this.value);
          }
        }
      },
      yAxis: {
        // Single y-axis for both series (millions)
        gridLineWidth: 0,
        title: { text: null },
        labels: { enabled: false }
      },
      plotOptions: {
        series: {
          marker: { enabled: false },
          lineWidth: 2,
          states: { hover: { lineWidthPlus: 0 } }
        }
      },

      exporting: { enabled: false },
      series: series,
      credits: { enabled: false }
    });
  } catch (error) {
    console.error('Error loading accounts data:', error);
  }
}

function createTotalAccountsChart() {
  try {
    const tezosData = aggregatedDataCache.totalAccountsData;
    const etherlinkData = aggregatedDataCache.etherlinkAccountsData;
    
    const series = [];
    
    // Tezos accounts series
    if (tezosData && tezosData.length > 0) {
      series.push({
        showInLegend: false,
        shadow: {
          color: 'rgba(255, 255, 0, 0.7)',
          offsetX: 0, offsetY: 0,
          opacity: 1, width: 10
        },
        name: 'Tezos Accounts',
        data: tezosData,
        dataLabels: {
          enabled: true,
          formatter: function() {
            return this.point.index === 0 ? `${(this.y / 1000000).toFixed(2)}M` : null;
          },
          align: 'right',
          verticalAlign: 'bottom',
        },
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#77dd77'], [1, '#ff6961']]
        }
      });
    }
    
    // Etherlink accounts series
    if (etherlinkData && etherlinkData.length > 0) {
      series.push({
        showInLegend: false,
        shadow: {
          color: 'rgba(0, 150, 255, 0.7)',
          offsetX: 0, offsetY: 0,
          opacity: 1, width: 8
        },
        name: 'Etherlink Accounts',
        data: etherlinkData,
        dataLabels: {
          enabled: true,
          formatter: function() {
            return this.point.index === this.series.data.length - 1 ? `${(this.y / 1000000).toFixed(2)}M` : null;
          },
          align: 'right',
          verticalAlign: 'bottom',
        },
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#87CEEB'],[1, '#4169E1']]
        },
        yAxis: 0  // Use primary y-axis (same as Tezos)
      });
    }

    Highcharts.chart('chart-container2', {
      chart: {
        type: 'spline',
        backgroundColor: 'rgba(0,0,0,0)'
      },
      title: {
        text: 'Total Accounts',
        style: { color: '#ffffff' }
      },
      xAxis: {
        type: 'datetime',
        lineColor: '#ffffff',
        lineWidth: 1,
        labels: {
          enabled: false,
          style: { color: '#ffffff' },
          formatter: function() {
            return Highcharts.dateFormat('%b %Y', this.value);
          }
        }
      },
      yAxis: {
        // Single y-axis for both series (millions)
        gridLineWidth: 0,
        title: { text: null },
        labels: { enabled: false }
      },
      plotOptions: {
        series: {
          marker: { enabled: false },
          lineWidth: 2,
          states: { hover: { lineWidthPlus: 0 } }
        }
      },

      exporting: { enabled: false },
      series: series,
      credits: { enabled: false }
    });
  } catch (error) {
    console.error('Error loading accounts data:', error);
  }
}

function createTotalTransactionsChart() {
  try {
    const tezosData = aggregatedDataCache.tezosTransactionsData;
    const etherlinkData = aggregatedDataCache.etherlinkTxnsData;
    
    const series = [];
    
    // Tezos transactions series
if (tezosData && tezosData.length > 0) {
  // Reverse to go from oldest to newest, then convert to cumulative
  const reversedTezosData = [...tezosData].reverse();
  const cumulativeTezosData = [];
  let runningTotal = 0;
  
  reversedTezosData.forEach(point => {
    runningTotal += point[1]; // Assuming point format is [timestamp, value]
    cumulativeTezosData.push([point[0], runningTotal]);
  });
  series.push({
    showInLegend: false,
    shadow: {
      color: 'rgba(255, 255, 0, 0.7)',
      offsetX: 0, offsetY: 0,
      opacity: 1, width: 10
    },
    name: 'Tezos Transactions',
    data: cumulativeTezosData,
    dataLabels: {
      enabled: true,
      formatter: function() {
        return this.point.index === this.series.data.length - 1 ? `${(this.y / 1000000).toFixed(1)}M` : null;
      },
      align: 'right',
      verticalAlign: 'bottom',
    },
    color: {
      linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
      stops: [[0, '#77dd77'], [1, '#ff6961']]
    }
  });
}
    
    if (etherlinkData && etherlinkData.length > 0) {
      series.push({
        showInLegend: false,
        shadow: {
          color: 'rgba(0, 150, 255, 0.7)',
          offsetX: 0, offsetY: 0,
          opacity: 1, width: 8
        },
        name: 'Etherlink Transactions',
        data: etherlinkData,
        dataLabels: {
          enabled: true,
          formatter: function() {
            return this.point.index === this.series.data.length - 1 ? `${(this.y / 1000000).toFixed(1)}M` : null;
          },
          align: 'right',
          verticalAlign: 'bottom',
        },
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#87CEEB'],[1, '#4169E1']]
        },
        yAxis: 0 
      });
    }

    Highcharts.chart('chart-container8', { 
      chart: {
        type: 'spline',
        backgroundColor: 'rgba(0,0,0,0)'
      },
      title: {
        text: 'Tezos & Etherlink cumulative tx growth',
        style: { color: '#ffffff' }
      },
      xAxis: {
        type: 'datetime',
        lineColor: '#ffffff',
        lineWidth: 1,
        labels: {
          enabled: false,
          style: { color: '#ffffff' },
          formatter: function() {
            return Highcharts.dateFormat('%b %Y', this.value);
          }
        }
      },
      yAxis: {
        gridLineWidth: 0,
        title: { text: null },
        labels: { enabled: false }
      },
      plotOptions: {
        series: {
          marker: { enabled: false },
          lineWidth: 2,
          states: { hover: { lineWidthPlus: 0 } }
        }
      },

      exporting: { enabled: false },
      series: series,
      credits: { enabled: false }
    });
  } catch (error) {
    console.error('Error loading transactions data:', error);
  }
}

function createTimeSeriesChart(containerId, title, data, formatter) {
  Highcharts.chart(containerId, {
    chart: {
      type: 'spline',
      backgroundColor: 'rgba(0,0,0,0)'
    },
    title: {
      text: title,
      style: { color: '#ffffff' }
    },
    xAxis: {
      type: 'datetime',
      lineColor: '#ffffff',
      lineWidth: 1,
      labels: { enabled: false }
    },
    yAxis: {
      gridLineWidth: 0,
      title: { text: null },
      labels: { enabled: false }
    },
    plotOptions: {
      series: {
        marker: { enabled: false },
        lineWidth: 2,
        states: { hover: { lineWidthPlus: 0 } },
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#77dd77'], [1, '#ff6961']]
        }
      }
    },
    exporting: { enabled: false },
    series: [{
      showInLegend: false,
      shadow: {
        color: 'rgba(255, 255, 0, 0.7)',
        offsetX: 0, offsetY: 0,
        opacity: 1, width: 10
      },
      name: title,
      data: data,
      dataLabels: {
        enabled: true,
        formatter: function() {
          return this.point.index === 0 ? formatter(this.y) : null;
        },
        align: 'right',
        verticalAlign: 'bottom',
      },
    }],
    credits: { enabled: false }
  });
}

function createHistoricalCharts(ratio) {
  try {
    const data = aggregatedDataCache.historicalCycleData;
    const issuanceData = processIssuanceData(data);
    const stakingData = processStakingData(data);
    currentCycle = issuanceData.currentCycle;
    
    const issuanceDataWithRatio = [
      ...issuanceData.ratios,
      ...ratio.map((ratioValue, index) => ({
        cycle: currentCycle + index,
        issuance: issuanceRateQ(index + currentCycle, ratioValue)
      }))
    ];
    
    createHistoricalChart('issuanceh', 'Issuance since genesis', issuanceDataWithRatio, d => ({
      x: d.cycle,
      y: d.issuance
    }), [428, 743, 823, currentCycle]);
    
    const stakingDataWithRatio = [
      ...stakingData.ratios, 
      ...ratio.map((ratioValue, index) => ({
        cycle: currentCycle + index, 
        staking: 0,
        ratio: ratioValue
      }))
    ];
    
    createHistoricalChart('stakingh', 'Staked since genesis', stakingDataWithRatio, d => ({
      x: d.cycle,
      y: (d.staking + (d.ratio || 0)) * 100
    }), [428, 743, 823, currentCycle]);
  } catch (error) {
    console.error('Error creating historical charts:', error);
  }
}

function createHistoricalChart(containerId, title, data, dataMapper, tickPositions) {
  const chartConfig = {
    chart: {
      type: 'spline',
      backgroundColor: 'rgba(0,0,0,0)',
      events: {
        load: function() { 
          this.customGroup = this.renderer.g('custom-lines').add();
          this.addCustomLines = function() {
            this.customGroup.destroy();
            this.customGroup = this.renderer.g('custom-lines').add();
            
            const chartData = data.map(dataMapper);
            [428, 743, 823, currentCycle].forEach(position => {
              const dataPoint = chartData.find(point => point.x === position);
              if (dataPoint) {
                const xPixel = this.xAxis[0].toPixels(position);
                const yPixel = this.yAxis[0].toPixels(dataPoint.y);
                const bottomPixel = this.plotTop + this.plotHeight;
                
                if (yPixel < bottomPixel) {
                  this.renderer.path([
                    'M', xPixel, bottomPixel,
                    'L', xPixel, yPixel
                  ])
                  .attr({
                    'stroke-width': 1,
                    stroke: '#ffffff',
                    'stroke-dasharray': '5,5'
                  })
                  .add(this.customGroup);
                }
              }
            });
          };
          
          this.addCustomLines();
        },
        redraw: function() {
          if (this.addCustomLines) {
            this.addCustomLines();
          }
        }
      }
    },
    title: {
      text: title,
      style: { color: '#ffffff' }
    },
    xAxis: {
      lineColor: '#ffffff',
      labels: {
        formatter: function() {
          if (this.value === 428) return 'Hangzhou';
          if (this.value === 743) return 'P';
          if (this.value === 823) return 'Q';
		  if (this.value === currentCycle) return 'Now';
          return '';
        },
        style: { color: '#ffffff' }
      },
      title: { text: null },
      tickInterval: 1,
      tickPositions: tickPositions
    },
    yAxis: {
      labels: { enabled: false },
      gridLineWidth: 0,
      title: { text: null },
      min: 0,
      max: containerId === 'issuanceh' ? 10 : 50,
      tickInterval: 1
    },
    tooltip: {
      formatter: function() {
        const label = containerId === 'issuanceh' ? 'Issuance' : 'Staking (frozen tez)';
        return `Cycle: ${this.x}<br><span style="color:${this.point.color}">●</span> ${label}: <b>${this.y.toFixed(2)}%</b><br/>`;
      }
    },
    series: [{
      zoneAxis: 'x',
      zones: [{ value: (currentCycle + 1) }, { dashStyle: 'ShortDot' }],
      showInLegend: false,
      shadow: {
        color: 'rgba(255, 255, 0, 0.7)',
        offsetX: 0, offsetY: 0,
        opacity: 1, width: 10
      },
      color: {
        linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
        stops: containerId === 'issuanceh' ? 
          [[0, '#ff6961'], [1, '#77dd77']] : 
          [[0, '#77dd77'], [1, '#ff6961']]
      },
      name: title,
      data: data.map(dataMapper),
      lineWidth: 3,
      dataLabels: {
        enabled: true,
        formatter: function() {
          if (this.point.index === this.series.data.length - 1 || this.point.x === currentCycle) {
            return `${this.y.toFixed(2)}%`;
          }
          return null;
        },
        align: 'right',
        verticalAlign: 'bottom',
      },
      marker: { enabled: false },
    }],
    credits: { enabled: false }
  };

  if (containerId === 'stakingh') {
    chartConfig.plotOptions = {
      series: {
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [[0, '#77dd77'], [1, '#ff6961']]
        },
        stickyTracking: true,
        dragDrop: {
          draggableY: true,
          dragMaxY: 100,
          dragMinY: 0,
          liveRedraw: true
        },
        point: {
          events: {
            drag: function(e) {
              const point = e.target;
              if (point.x <= currentCycle + 1) {
                e.newPoint.y = point.y;
                return;
              }
              const newValue = e.newPoint.y;
              const series = point.series;
              const updatedData = series.data.map((p, i) => ({
                x: p.x,
                y: i >= point.index ? parseFloat(newValue) : p.y
              }));
              series.setData(updatedData, true, {
                duration: 800,
                easing: 'easeOutBounce'
              });
              updateIssuanceChart(updatedData);
            }
          }
        }
      }
    };
  }

  Highcharts.chart(containerId, chartConfig);
}

function updateIssuanceChart(newStakingData) {
  const issuanceChart = Highcharts.charts.find(chart => 
    chart && chart.renderTo && chart.renderTo.id === 'issuanceh'
  );
  
  if (!issuanceChart) return;
  
  const originalData = issuanceChart.series[0].options.data;
  
  const updatedData = originalData.map(point => {
    if (point.x > currentCycle) {
      const stakingPoint = newStakingData.find(sp => sp.x === point.x);
      if (stakingPoint) {
        return {
          x: point.x,
          y: issuanceRateQ(point.x, stakingPoint.y / 100)
        };
      }
    }
    return point;
  });
  
  issuanceChart.series[0].setData(updatedData, true);
}

function processIssuanceData(data) {
  const ratios = [];
  
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    const prevSupply = parseFloat(prev.totalSupply);
    const currSupply = parseFloat(curr.totalSupply);
    const supplyDiff = currSupply - prevSupply;
    const growthRate = supplyDiff / prevSupply;
    const timeDiffSec = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 1000;
    const annualized = (growthRate * ((365.25 * 24 * 60 * 60) / timeDiffSec)) * 100;
    //365.25 is a way

    ratios.push({ cycle: curr.cycle, issuance: annualized });
  }

  return { ratios, currentCycle: data[data.length - 1].cycle };
}

function processStakingData(data) {
  return {
    ratios: data.slice(1).map(curr => ({
      cycle: curr.cycle,
      staking: curr.totalFrozen / curr.totalSupply
    })),
    currentCycle: data[data.length - 1].cycle
  };
}


function createTVLChart() {
  try {
    const tvlData = aggregatedDataCache.tvlData;
    if (!tvlData || !tvlData.series || tvlData.series.length === 0) {
      console.error('No TVL data available');
      return;
    }
    
    const series = tvlData.series[0];
    const projects = series.values[0];
    const tvlValues = series.values[1];
	
    const layers = series.values[2];
    
    // Calculate sum of specific protocols
    const targetProtocols = ["Midas RWA", "Uranium.io", "Spiko"];
    specificProtocolsTVL = 0;
    
    projects.forEach((project, index) => {
      if (targetProtocols.includes(project)) {
        specificProtocolsTVL += tvlValues[index];
      }
    });
    
    console.log(`Sum of ${targetProtocols.join(', ')}: $${specificProtocolsTVL.toLocaleString()}`);
    
    // Create gradient colors with transparency for each slice
    const pieData = projects.map((project, index) => {
      const hue = (index * 45) % 360; // Spread colors across spectrum
      
      return {
        name: `${project}`,
        y: tvlValues[index],
        color: {
          radialGradient: {
            cx: 0.5,
            cy: 0.5,
            r: 0.8
          },
          stops: [
            [0, `hsla(${hue}, 85%, 70%, 0.9)`], // Semi-transparent center
            [0.5, `hsla(${hue}, 75%, 55%, 0.8)`], // More transparent middle
            [1, `hsla(${hue}, 65%, 40%, 0.7)`] // Most transparent edge
          ]
        }
      };
    });
    
    totalTVL = tvlValues.reduce((sum, value) => sum + value, 0);
    
    Highcharts.chart('tvl-chart-container', {
      chart: {
        backgroundColor: 'rgba(0,0,0,0)',
        type: 'pie'
      },
      title: {
        text: 'DeFi TVL (+RWA)',
        style: { color: '#ffffff', fontSize: '24px' }
      },
      subtitle: {
        text: `Total: $${totalTVL.toLocaleString()}`,
        style: { color: '#cccccc', fontSize: '16px' }
      },
      tooltip: {
        pointFormat: 'Share: {point.percentage:.1f}%'
      },
      plotOptions: {
        pie: {
          allowPointSelect: true,
          cursor: 'pointer',
          states: {
            hover: {
              brightness: 0.1 // Slight brightness increase on hover
            }
          }
        }
      },
      series: [{
        name: 'TVL',
        data: pieData,
        showInLegend: false,
        dataLabels: {
          enabled: true,
          format: '{point.name}<br/>${point.y:,.0f}',
          style: { 
            color: '#ffffff', 
            fontSize: '12px',
            textOutline: '1px contrast' // Better text visibility
          },
          distance: 20
        },
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 2
      }],
      exporting: { enabled: false },
      credits: { enabled: false }
    });
  } catch (error) {
    console.error('Error creating TVL chart:', error);
  }
}


function main(ratio) {
  createHistoricalCharts(ratio);
  createDALSupportChart();
  createBurnedSupplyChart();
  createTotalAccountsChart();
  createTotalTransactionsChart();
  createTVLChart();
  createHistoricalTvlChart();
  
  try {
    const data = aggregatedDataCache.homeData;
    const { totalStakedPercentage, totalDelegatedPercentage, stakingApy, delegationApy } = data.stakingData;
    createPieChart(
      totalStakedPercentage, 
      totalDelegatedPercentage, 
      stakingApy.toFixed(2), 
      delegationApy.toFixed(2)
    );
  } catch (error) {
    console.error('Error creating pie chart:', error);
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {

      const ratios = await initializeRatios();
      main(ratios);
    
  } catch (error) {
    console.error('Error during initialization:', error);
  }
});
