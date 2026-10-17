const TRANSITION_PERIOD = 50;
const INITIAL_PERIOD = 10;
const AI_ACTIVATION_CYCLE = 748;
const LB_SUBSIDY = 2628000000000;
const WORKER_URL = 'https://tez.cool/api/v1/getData';
let aggregatedDataCache = null;
let currentCycle, forecasted, tmp = 0, tmp1;
let totalTVL;
let specificProtocolsTVL = 0;
let stakingSimulator;
let currentTVLTimeframe = '3y';
let currentBurnedSupplyTimeframe = 'cumulative';
const DOMCache = {};
const MemoCache = new Map();
function cacheDOM(id) {
    if (!DOMCache[id])
        DOMCache[id] = document.getElementById(id);
    return DOMCache[id];
}
function memoize(key, fn, duration = 60000) {
    const cached = MemoCache.get(key);
    if (cached && Date.now() - cached.time < duration)
        return cached.value;
    const value = fn();
    MemoCache.set(key, {
        value,
        time: Date.now()
    });
    return value;
}
function initializeStakingSimulator() {
    stakingSimulator = new StakingSimulator();
}
class StakingSimulator {
    constructor() {
        this.inputs = {};
        this.displays = {};
        this.stakingAPY = 0;
        this.delegationAPY = 0;
        this.init();
    }
    throttle(fn, delay) {
        let lastCall = 0;
        return (...args) => {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                fn(...args);
            }
        };
    }
    init() {
        setTimeout(() => {
            this.bindElements();
            if (this.inputs.xtz && this.inputs.days && this.inputs.fee) {
                this.setupEventListeners();
                this.updateAPYValues();
                this.calculateRewards();
            }
        }, 100);
    }
    bindElements() {
        this.inputs = {
            xtz: cacheDOM('xtz-amount'),
            fee: cacheDOM('baker-fee'),
            days: cacheDOM('days-slider')
        };
        this.displays = {
            daysDisplay: cacheDOM('days-display'),
            stakingApy: cacheDOM('staking-apy'),
            delegationApy: cacheDOM('delegation-apy'),
            stakingRewards: cacheDOM('staking-rewards'),
            delegationRewards: cacheDOM('delegation-rewards'),
            stakingTotal: cacheDOM('staking-total'),
            delegationTotal: cacheDOM('delegation-total')
        };
    }
    setupEventListeners() {
        const calcThrottled = this.throttle(() => this.calculateRewards(), 100);
        const handleNum = (e, max, decimals) => {
            e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
            let val = parseFloat(e.target.value.replace(',', '.')) || 0;
            if (val < 0)
                val = 0;
            if (val > max)
                val = max;
            e.target.value = decimals ? val.toFixed(decimals) : val.toString();
            calcThrottled();
        };
        this.inputs.xtz.addEventListener('input', (e) => handleNum(e, 1000000, 0));
        this.inputs.fee.addEventListener('input', (e) => handleNum(e, 100, 0));
        this.inputs.days.addEventListener('input', () => {
            this.displays.daysDisplay.textContent = this.inputs.days.value;
            calcThrottled();
        });
    }
    updateAPYValues() {
        try {
            if (aggregatedDataCache?.homeData?.stakingData) {
                const {
                    stakingApy,
                    delegationApy
                } = aggregatedDataCache.homeData.stakingData;
                this.stakingAPY = stakingApy || 0;
                this.delegationAPY = delegationApy || 0;
                this.displays.stakingApy.textContent = `${this.stakingAPY.toFixed(2)}%`;
                this.displays.delegationApy.textContent = `${this.delegationAPY.toFixed(2)}%`;
            }
        } catch (error) {
            console.error('APY error:', error);
            this.stakingAPY = 10;
            this.delegationAPY = 3.4;
        }
    }
    formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    }
    calculateCompoundRewards(principal, annualRate, days, bakerFee = 0) {
        const netRate = (annualRate / 100) * (1 - bakerFee / 100);
        const dailyRate = Math.pow(1 + netRate, 1 / 365) - 1;
        return principal * Math.pow(1 + dailyRate, days) - principal;
    }
    calculateRewards() {
        if (!this.inputs.xtz)
            return;
        const principal = parseInt(this.inputs.xtz.value) || 0;
        const days = parseInt(this.inputs.days.value) || 0;
        const bakerFee = parseInt(this.inputs.fee.value) || 0;
        if (principal <= 0) {
            this.updateDisplays(0, 0, 0, 0);
            return;
        }
        const stakingRewards = this.calculateCompoundRewards(principal, this.stakingAPY, days, bakerFee);
        const delegationRewards = this.calculateCompoundRewards(principal, this.delegationAPY, days, bakerFee);
        this.updateDisplays(stakingRewards, principal + stakingRewards, delegationRewards, principal + delegationRewards);
    }
    updateDisplays(sRewards, sTotal, dRewards, dTotal) {
        this.displays.stakingRewards.textContent = `+${this.formatNumber(sRewards)} XTZ`;
        this.displays.stakingTotal.textContent = `${this.formatNumber(sTotal)} XTZ`;
        this.displays.delegationRewards.textContent = `+${this.formatNumber(dRewards)} XTZ`;
        this.displays.delegationTotal.textContent = `${this.formatNumber(dTotal)} XTZ`;
    }
}
class NavigationManager {
    constructor() {
        this.navItems = document.querySelectorAll('.nav-item');
        this.homeContent = cacheDOM('home-content');
        this.iframeContainers = document.querySelectorAll('.iframe-container');
        this.preloadedIframes = new Set();
        this.currentView = 'home';
        this.savedScrollPosition = 0;
        this.resizeTimeout = null;
        this.init();
    }
    init() {
        document.addEventListener('click', (e) => {
            const item = e.target.closest('.nav-item');
            if (!item)
                return;
            const target = item.dataset.target;
            const url = item.dataset.url;
            if (item.dataset.external === 'true' && url) {
                window.open(url);
                return;
            }
            if (target && target !== this.currentView)
                this.navigateTo(target, url, item);
        });
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                if (this.currentView !== 'home')
                    this.adjustContainerHeight();
            }, 200);
        });
        setTimeout(() => this.preloadIframes(), 2000);
    }
    preloadIframes() {
        this.navItems.forEach(item => {
            const target = item.dataset.target;
            const url = item.dataset.url;
            if (url && target !== 'home' && item.dataset.external !== 'true' && !this.preloadedIframes.has(target)) {
                requestIdleCallback(() => this.preloadIframe(target, url));
            }
        });
    }
    preloadIframe(target, url) {
        const iframe = document.getElementById(`${target}-iframe`);
        if (!iframe)
            return;
        iframe.onload = () => this.preloadedIframes.add(target);
        iframe.onerror = () => console.warn(`Preload failed: ${target}`);
        iframe.src = url;
    }
    adjustContainerHeight() {
        const mainContainer = document.querySelector('.container.scrollable-content');
        if (!mainContainer)
            return;
        if (this.currentView === 'home') {
            Object.assign(mainContainer.style, {
                height: 'auto',
                minHeight: '100vh',
                maxHeight: 'none',
                overflow: 'visible'
            });
            mainContainer.scrollTop = this.savedScrollPosition;
        } else {
            const vh = window.innerHeight;
            Object.assign(mainContainer.style, {
                height: `${vh}px`,
                minHeight: `${vh}px`,
                maxHeight: `${vh}px`,
                overflow: 'hidden'
            });
        }
    }
    navigateTo(target, url, clickedItem) {
        const mainContainer = document.querySelector('.container.scrollable-content');
        
        if (this.currentView === 'home' && target !== 'home') {
            if (mainContainer)
                this.savedScrollPosition = mainContainer.scrollTop;
        }
        this.navItems.forEach(item => item.classList.remove('active'));
        clickedItem.classList.add('active');
        if (target === 'home') {
            this.homeContent.classList.remove('hidden');
            this.iframeContainers.forEach(c => c.classList.remove('active'));
        } else {
            this.homeContent.classList.add('hidden');
            this.iframeContainers.forEach(c => c.classList.remove('active'));
            const targetContainer = document.getElementById(`${target}-container`);
            const targetIframe = document.getElementById(`${target}-iframe`);
            if (targetContainer && targetIframe) {
                if (!this.preloadedIframes.has(target) && targetIframe.src === 'about:blank') {
                    clickedItem.classList.add('loading');
                    targetIframe.onload = () => {
                        clickedItem.classList.remove('loading');
                        this.preloadedIframes.add(target);
                    };
                    targetIframe.src = url;
                }
                targetContainer.classList.add('active');
            }
            if (mainContainer) {
                mainContainer.scrollTop = 0;
            }
        }
        this.currentView = target;
        setTimeout(() => this.adjustContainerHeight(), 100);
    }
}
function setupSmartTooltipPositioning() {
    const bakersGrid = document.getElementById('bakers-grid');
    if (!bakersGrid)
        return;
    let resizeTimeout;
    const updateTooltipPositions = () => {
        const bakerItems = bakersGrid.querySelectorAll('.baker-item');
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const isMobile = vw <= 640;
        const rects = Array.from(bakerItems).map(item => ({
                    item,
                    rect: item.getBoundingClientRect()
                }));
        rects.forEach(({
                item,
                rect
            }) => {
            const tooltip = item.querySelector('.baker-tooltip');
            if (!tooltip)
                return;
            item.classList.remove('tooltip-left', 'tooltip-right', 'tooltip-top', 'tooltip-bottom');
            tooltip.style.minWidth = '';
            if (isMobile) {
                const spaceBelow = vh - rect.bottom;
                const spaceAbove = rect.top;
                if (spaceBelow >= 150) {
                    item.classList.add('tooltip-bottom');
                } else if (spaceAbove >= 150) {
                    item.classList.add('tooltip-top');
                } else {
                    const spaceRight = vw - rect.right;
                    item.classList.add(spaceRight >= 240 ? 'tooltip-right' : 'tooltip-left');
                }
            } else {
                const spaceRight = vw - rect.right;
                item.classList.add(spaceRight >= 320 ? 'tooltip-right' : 'tooltip-left');
            }
        });
    };
    updateTooltipPositions();
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateTooltipPositions, 150);
    });
    new MutationObserver(updateTooltipPositions).observe(bakersGrid, {
        childList: true
    });
}
function renderBakers(bakers) {
    const bakersGrid = document.getElementById('bakers-grid');
    bakersGrid.innerHTML = '';
    const sorted = bakers.filter(b => b.status === 'active' && b.staking?.enabled).sort((a, b) => (b.staking?.estimatedApy || 0) - (a.staking?.estimatedApy || 0)).slice(0, 100);
    const batchSize = 10;
    let idx = 0;
    function renderBatch() {
        const end = Math.min(idx + batchSize, sorted.length);
        const frag = document.createDocumentFragment();
        for (let i = idx; i < end; i++) {
            const el = createBakerElement(sorted[i]);
            if (el)
                frag.appendChild(el);
        }
        bakersGrid.appendChild(frag);
        idx = end;
        if (idx < sorted.length) {
            requestAnimationFrame(renderBatch);
        } else if ('requestIdleCallback' in window) {
            requestIdleCallback(setupSmartTooltipPositioning, { timeout: 500 });
        } else {
            setTimeout(setupSmartTooltipPositioning, 0);
        }
    }
    renderBatch();
}
function createBakerElement(baker) {
    const div = document.createElement('div');
    div.className = 'baker-item';
    const s = baker.staking || {};
    const apy = s.estimatedApy || 0;
    const fee = s.fee || 0;
    const cap = s.capacity || 0;
    const free = s.freeSpace || 0;
    const pct = cap > 0 ? ((cap - free) / cap) * 100 : 0;
    div.innerHTML = `

        <div class="baker-avatar">

            <img src="https://services.tzkt.io/v1/avatars/${escapeHTML(baker.address)}" 

                 alt="${escapeHTML(baker.name)}" loading="lazy" crossorigin="anonymous"

                 onerror="this.style.display='none'" 

                 onclick="window.open('https://tzkt.io/${escapeHTML(baker.address)}', '_blank')"/>

        </div>

        <div class="baker-tooltip">

            <div class="baker-name">${escapeHTML(baker.name) || 'Unknown'}</div>

            <div class="baker-status ${escapeHTML(baker.status)}">${escapeHTML(baker.status)}</div>

            <div class="baker-info">

                <div class="baker-info-row">

                    <span class="baker-info-label">Staking APY:</span>

                    <span class="baker-info-value baker-apy">${(apy * 100).toFixed(2)}%</span>

                </div>

                <div class="baker-info-row">

                    <span class="baker-info-label">Fee:</span>

                    <span class="baker-info-value baker-fee">${(fee * 100).toFixed(1)}%</span>

                </div>

                <div class="baker-info-row">

                    <span class="baker-info-label">Capacity:</span>

                    <span class="baker-info-value">${formatNumber(cap)} XTZ</span>

                </div>

                <div style="margin-top: 8px;">

                    <div class="capacity-bar">

                        <div class="capacity-fill" style="width: ${Math.min(pct, 100)}%"></div>

                    </div>

                    <div class="capacity-text">${pct.toFixed(1)}% filled</div>

                </div>

                <div class="baker-info-row" style="margin-top: 4px;">

                    <span class="baker-info-label">Available:</span>

                    <span class="baker-info-value">${formatNumber(free)} XTZ</span>

                </div>

            </div>

        </div>

    `;
    return div;
}
function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function formatNumber(num) {
    if (num >= 1000000)
        return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000)
        return (num / 1000).toFixed(1) + 'K';
    return num.toFixed(0);
}
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
        }
    },
    yAxis: {
        labels: {
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
    }
});
function computeExtremum(cycle, initialValue, finalValue) {
    const initialLimit = AI_ACTIVATION_CYCLE + INITIAL_PERIOD;
    const transLimit = initialLimit + TRANSITION_PERIOD + 1;
    if (cycle <= initialLimit)
        return initialValue;
    if (cycle >= transLimit)
        return finalValue;
    const t = cycle - initialLimit;
    return (t * (finalValue - initialValue) / (TRANSITION_PERIOD + 1)) + initialValue;
}
function minimumRatio(cycle) {
    return computeExtremum(cycle, 0.045, 0.0025);
}
function maximumRatio(cycle) {
    return computeExtremum(cycle, 0.055, 0.1);
}
function stakedRatio(cycle, value) {
    return value;
}
function clip(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(value, maxValue));
}
function trueMaximumRatio(adjCycle, value) {
    const max_max = maximumRatio(adjCycle);
    if (adjCycle >= 821) {
        return Math.max(Math.min(max_max, adaptiveMaximum(value)), minimumRatio(adjCycle));
    }
    return Math.max(max_max, minimumRatio(adjCycle));
}
function staticRate(cycle, value, trueMax) {
    const staticRateValue = 1 / 1600 * (1 / (value ** 2));
    return clip(staticRateValue, minimumRatio(cycle), trueMax);
}
function applyBonus(cycle, value, targetRatio, tmp1, trueMax) {
    if (cycle <= AI_ACTIVATION_CYCLE) {
        tmp = 0;
        return 0;
    }
    const previousBonus = tmp;
    const stakedRatioValue = tmp1;
    const staticRateValue = staticRate(cycle, value, trueMax);
    const staticRateDistToMax = trueMax - staticRateValue;
    const udist = Math.max(0, Math.abs(stakedRatioValue - targetRatio) - 0.02);
    const dist = stakedRatioValue >= targetRatio ? -udist : udist;
    const maxNewBonus = Math.min(staticRateDistToMax, 0.05);
    // Removed unnecessary ternary since cycle is always > 858 for future projections
    const newBonus = previousBonus + dist * 0.01;
    const res = clip(newBonus, 0, maxNewBonus);
    console.assert(res >= 0 && res <= 5);
    tmp = res;
    return res;
}
function dyn(cycle, value, tmp1, trueMax) {
    return applyBonus(cycle, value, 0.5, tmp1, trueMax);
}
function adaptiveMaximum(r) {
    if (r >= 0.5)
        return 0.01;
    if (r <= 0.05)
        return 0.1;
    const y = (1 + 9 * Math.pow((50 - 100 * r) / 42, 2)) / 100;
    return clip(y, 0.01, 0.1);
}
function issuanceRateQ(cycle, value) {
    const adjustedCycle = cycle - 2;
    tmp1 = value;
    const trueMax = trueMaximumRatio(adjustedCycle, value);
    const staticRateRatio = staticRate(adjustedCycle, value, trueMax);
    const bonus = dyn(adjustedCycle, value, tmp1, trueMax);
    const ratioMin = minimumRatio(adjustedCycle);
    const totalRate = staticRateRatio + bonus;
    return clip(totalRate, ratioMin, trueMax) * 100;
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
    return arr.reduce((sum, val, idx, array) => idx > 0 ? sum + Math.abs(val - array[idx - 1]) : sum, 0) / (arr.length - 1);
}
function slowIncrement(current, avgDiff) {
    const center = 0.5;
    const scale = 6;
    return avgDiff * 0.2 / (1 + Math.exp((Math.abs(current - center) - center) / scale));
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
            const ratio = ((cycleData.totalOwnStaked || cycleData.totalExternalStaked) ? cycleData.totalOwnStaked + cycleData.totalExternalStaked : cycleData.totalFrozen) / cycleData.totalSupply;
            ratios.push(ratio);
            last = ratio;
        });
        while (ratios.length < relevantData.length + 800) {
            last += slowIncrement(last, calculateAverageDifference(ratios));
            ratios.push(last);
        }
        forecasted = ratios[ratios.length - 1];
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
        chart.renderer.path(['M', xPos, yPosTop, 'L', xPos, yPosBottom]).attr({
            'stroke-width': 0.5,
            stroke: '#ffffff',
        }).add();
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
            style: {
                color: '#ffffff',
                fontSize: '24px'
            }
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
                        brightness: 0.1
                    }
                }
            }
        },
        series: [{
                name: 'Ratios',
                data: [{
                        name: 'Staked (' + escapeHTML(stakedAPY) + '% APY)',
                        y: totalStakedPercentage,
                        color: {
                            radialGradient: {
                                cx: 0.5,
                                cy: 0.5,
                                r: 0.8
                            },
                            stops: [[0, 'hsla(220, 85%, 70%, 0.9)'], [0.5, 'hsla(220, 75%, 55%, 0.8)'], [1, 'hsla(220, 65%, 40%, 0.7)']]
                        }
                    }, {
                        name: 'Delegated (' + escapeHTML(delegatedAPY) + '% APY)',
                        y: totalDelegatedPercentage,
                        color: {
                            radialGradient: {
                                cx: 0.5,
                                cy: 0.5,
                                r: 0.8
                            },
                            stops: [[0, 'hsla(280, 85%, 70%, 0.9)'], [0.5, 'hsla(280, 75%, 55%, 0.8)'], [1, 'hsla(280, 65%, 40%, 0.7)']]
                        }
                    }, {
                        name: 'Passive',
                        y: jeetsPercentage,
                        color: {
                            radialGradient: {
                                cx: 0.5,
                                cy: 0.5,
                                r: 0.8
                            },
                            stops: [[0, 'hsla(10, 85%, 70%, 0.9)'], [0.5, 'hsla(10, 75%, 55%, 0.8)'], [1, 'hsla(10, 65%, 40%, 0.7)']]
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
                        textOutline: '1px contrast'
                    }
                },
                borderColor: 'rgba(255,255,255,0.2)',
                borderWidth: 2
            }
        ],
        exporting: {
            enabled: false
        },
        credits: {
            enabled: false
        }
    });
}
function createDALSupportChart() {
    try {
        const data = aggregatedDataCache.dalHistoryData;
        const latestCycle = data[data.length - 1]?.cycle || currentCycle;
        const chartData = data
    .map(item => ({
        x: item.cycle,
        y: item.dal_baking_power_percentage / 100
    }))
    .filter(item => item.y !== 0);
        Highcharts.chart('chart-container5', {
            chart: {
                type: 'spline',
                backgroundColor: 'rgba(0,0,0,0)',
            },
            title: {
                text: 'DAL support',
                style: {
                    color: '#ffffff'
                }
            },
            xAxis: {
                lineColor: '#ffffff',
                lineWidth: 1,
                labels: {
                    enabled: false
                }
            },
            yAxis: {
                gridLineWidth: 0,
                title: {
                    text: null
                },
                labels: {
                    enabled: false
                },
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
                    }
                ]
            },
            tooltip: {
                formatter: function () {
                    return `Cycle: ${this.x}<br><span style="color:${this.point.color}">●</span> DAL Support: <b>${(this.y * 100).toFixed(2)}%</b><br/>`;
                }
            },
            series: [{
                    shadow: {
                        color: 'rgba(255, 255, 0, 0.7)',
                        offsetX: 0,
                        offsetY: 0,
                        opacity: 1,
                        width: 10
                    },
                    name: "DAL Support",
                    showInLegend: false,
                    data: chartData,
                    dataLabels: {
                        enabled: true,
                        formatter: function () {
                            if (this.point.index === this.series.data.length - 1) {
                                return `${(this.y * 100).toFixed(2)}%`;
                            }
                            return null;
                        },
                        align: 'right',
                        verticalAlign: 'bottom',
                    },
                    lineWidth: 2,
                    marker: {
                        enabled: false
                    },
                    color: {
                        linearGradient: {
                            x1: 0,
                            y1: 0,
                            x2: 0,
                            y2: 1
                        },
                        stops: [[0, '#77dd77'], [1, '#ff6961']]
                    }
                }
            ],
            credits: {
                enabled: false
            }
        });
    } catch (error) {
        console.error('Error loading DAL data:', error);
    }
}
function createBurnedSupplyChart() {
    try {
        const seriesData = aggregatedDataCache.burnedSupplyData;
        let processedData;
        let isCumulative = currentBurnedSupplyTimeframe === 'cumulative';
        if (isCumulative) {
            processedData = seriesData;
        } else {
            const now = Date.now();
            const timeRanges = {
                '1y': 365 * 24 * 60 * 60 * 1000,
                '3y': 3 * 365 * 24 * 60 * 60 * 1000,
                '7y': 7 * 365 * 24 * 60 * 60 * 1000
            };
            const timeRange = timeRanges[currentBurnedSupplyTimeframe];
            const startTime = now - timeRange;
            const dataWithoutLatest = seriesData.slice(1);
            const filteredData = dataWithoutLatest.filter(point => point[0] >= startTime);
            if (filteredData.length < 2) {
                processedData = seriesData;
            } else {
                const sortedData = [...filteredData].sort((a, b) => a[0] - b[0]);
                processedData = [];
                for (let i = 1; i < sortedData.length; i++) {
                    const diff = sortedData[i][1] - sortedData[i - 1][1];
                    processedData.push([sortedData[i][0], diff]);
                }
                processedData.reverse();
            }
        }
        const formatter = isCumulative ? value => `${(value / 1000000).toFixed(2)}M` : value => `${(value / 1000).toFixed(2)}K`;
        createTimeSeriesChart('chart-container', 'Burned supply', processedData, formatter, isCumulative);
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
            const prevValue = newResult[newResult.length - 1][1];
            const currentValue = result[i][1];
            const dipPercent = (prevValue - currentValue) / prevValue;
            if (dipPercent > threshold) {
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
        const timestampFilters = {
            '5y': 1598918400000000,
            '3y': 1655769600000000
        };
        const filterTimestamp = timestampFilters[currentTVLTimeframe];
        let rawData = aggregatedDataCache.combinedTvlChart.filter(item => item[0] > filterTimestamp).map(item => [item[0] / 1000, item[1]]).sort((a, b) => a[0] - b[0]);
        const tezosData = recursivelyRemoveDips(rawData, 0.2);
        if (tezosData.length > 0) {
            tezosData[tezosData.length - 1][1] = totalTVL - specificProtocolsTVL;
        }
        const series = [];
        series.push({
            showInLegend: false,
            shadow: {
                color: 'rgba(255, 255, 0, 0.7)',
                offsetX: 0,
                offsetY: 0,
                opacity: 1,
                width: 10
            },
            name: 'TVL',
            data: tezosData,
            dataLabels: {
                enabled: true,
                formatter: function () {
                    return this.point.index === this.series.data.length - 1 ? `$${(this.y / 1000000).toFixed(2)}M` : null;
                },
                align: 'right',
                verticalAlign: 'bottom',
            },
            color: {
                linearGradient: {
                    x1: 0,
                    y1: 0,
                    x2: 0,
                    y2: 1
                },
                stops: [[0, '#77dd77'], [1, '#ff6961']]
            }
        });
        Highcharts.chart('chart-container9', {
            chart: {
                type: 'spline',
                backgroundColor: 'rgba(0,0,0,0)'
            },
            title: {
                text: 'DeFi growth (L1+L2-RWA)',
                style: {
                    color: '#ffffff'
                }
            },
            tooltip: {
                style: {
                    fontFamily: '"Monda", Helvetica, Arial, sans-serif'
                },
                valuePrefix: '$'
            },
            xAxis: {
                type: 'datetime',
                lineColor: '#ffffff',
                lineWidth: 1,
                labels: {
                    enabled: false,
                    style: {
                        color: '#ffffff'
                    },
                    formatter: function () {
                        return Highcharts.dateFormat('%b %Y', this.value);
                    }
                }
            },
            yAxis: {
                gridLineWidth: 0,
                title: {
                    text: null
                },
                labels: {
                    enabled: false
                }
            },
            plotOptions: {
                series: {
                    connectNulls: false,
                    marker: {
                        enabled: false
                    },
                    lineWidth: 2,
                    states: {
                        hover: {
                            lineWidthPlus: 0
                        }
                    }
                }
            },
            exporting: {
                enabled: false
            },
            series: series,
            credits: {
                enabled: false
            }
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
        if (tezosData && tezosData.length > 0) {
            series.push({
                showInLegend: false,
                shadow: {
                    color: 'rgba(255, 255, 0, 0.7)',
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    width: 10
                },
                name: 'Tezos Accounts',
                data: tezosData,
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        return this.point.index === 0 ? `${(this.y / 1000000).toFixed(2)}M` : null;
                    },
                    align: 'right',
                    verticalAlign: 'bottom',
                },
                color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
                    stops: [[0, '#77dd77'], [1, '#ff6961']]
                }
            });
        }
        if (etherlinkData && etherlinkData.length > 0) {
            series.push({
                showInLegend: false,
                shadow: {
                    color: 'rgba(0, 150, 255, 0.7)',
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    width: 8
                },
                name: 'Etherlink Accounts',
                data: etherlinkData,
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        return this.point.index === this.series.data.length - 1 ? `${(this.y / 1000000).toFixed(2)}M` : null;
                    },
                    align: 'right',
                    verticalAlign: 'bottom',
                },
                color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
                    stops: [[0, '#87CEEB'], [1, '#4169E1']]
                },
                yAxis: 0
            });
        }
        Highcharts.chart('chart-container2', {
            chart: {
                type: 'spline',
                backgroundColor: 'rgba(0,0,0,0)'
            },
            title: {
                text: 'Total accounts',
                style: {
                    color: '#ffffff'
                }
            },
            xAxis: {
                type: 'datetime',
                lineColor: '#ffffff',
                lineWidth: 1,
                labels: {
                    enabled: false,
                    style: {
                        color: '#ffffff'
                    },
                    formatter: function () {
                        return Highcharts.dateFormat('%b %Y', this.value);
                    }
                }
            },
            yAxis: {
                gridLineWidth: 0,
                title: {
                    text: null
                },
                labels: {
                    enabled: false
                }
            },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    },
                    lineWidth: 2,
                    states: {
                        hover: {
                            lineWidthPlus: 0
                        }
                    }
                }
            },
            exporting: {
                enabled: false
            },
            series: series,
            credits: {
                enabled: false
            }
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
        if (tezosData && tezosData.length > 0) {
            const reversedTezosData = [...tezosData].reverse();
            const cumulativeTezosData = [];
            let runningTotal = 0;
            reversedTezosData.forEach(point => {
                runningTotal += point[1];
                cumulativeTezosData.push([point[0], runningTotal]);
            });
            series.push({
                showInLegend: false,
                shadow: {
                    color: 'rgba(255, 255, 0, 0.7)',
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    width: 10
                },
                name: 'Tezos Transactions',
                data: cumulativeTezosData,
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        return this.point.index === this.series.data.length - 1 ? `${(this.y / 1000000).toFixed(1)}M` : null;
                    },
                    align: 'right',
                    verticalAlign: 'bottom',
                },
                color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
                    stops: [[0, '#77dd77'], [1, '#ff6961']]
                }
            });
        }
        if (etherlinkData && etherlinkData.length > 0) {
            series.push({
                showInLegend: false,
                shadow: {
                    color: 'rgba(0, 150, 255, 0.7)',
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    width: 8
                },
                name: 'Etherlink Transactions',
                data: etherlinkData,
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        return this.point.index === this.series.data.length - 1 ? `${(this.y / 1000000).toFixed(1)}M` : null;
                    },
                    align: 'right',
                    verticalAlign: 'bottom',
                },
                color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
                    stops: [[0, '#87CEEB'], [1, '#4169E1']]
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
                style: {
                    color: '#ffffff'
                }
            },
            xAxis: {
                type: 'datetime',
                lineColor: '#ffffff',
                lineWidth: 1,
                labels: {
                    enabled: false,
                    style: {
                        color: '#ffffff'
                    },
                    formatter: function () {
                        return Highcharts.dateFormat('%b %Y', this.value);
                    }
                }
            },
            yAxis: {
                gridLineWidth: 0,
                title: {
                    text: null
                },
                labels: {
                    enabled: false
                }
            },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    },
                    lineWidth: 2,
                    states: {
                        hover: {
                            lineWidthPlus: 0
                        }
                    }
                }
            },
            exporting: {
                enabled: false
            },
            series: series,
            credits: {
                enabled: false
            }
        });
    } catch (error) {
        console.error('Error loading transactions data:', error);
    }
}
function createTimeSeriesChart(containerId, title, data, formatter, isCumulative = true) {
    let highPoint = null;
    let lowPoint = null;
    if (!isCumulative && data.length > 0) {
        highPoint = data.reduce((max, point) => point[1] > max[1] ? point : max, data[0]);
        lowPoint = data.reduce((min, point) => point[1] < min[1] ? point : min, data[0]);
    }
    Highcharts.chart(containerId, {
        chart: {
            type: 'spline',
            backgroundColor: 'rgba(0,0,0,0)'
        },
        title: {
            text: title,
            style: {
                color: '#ffffff'
            }
        },
        xAxis: {
            type: 'datetime',
            lineColor: '#ffffff',
            lineWidth: 1,
            labels: {
                enabled: false
            }
        },
        yAxis: {
            gridLineWidth: 0,
            title: {
                text: null
            },
            labels: {
                enabled: false
            }
        },
        tooltip: {
            style: {
                fontFamily: '"Monda", Helvetica, Arial, sans-serif'
            },
            valueDecimals: 0,
            valueSuffix: ' XTZ',
            xDateFormat: '%b %Y'
        },
        plotOptions: {
            series: {
                marker: {
                    enabled: false
                },
                lineWidth: 2,
                states: {
                    hover: {
                        lineWidthPlus: 0
                    }
                },
                color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
                    stops: [[0, '#77dd77'], [1, '#ff6961']]
                }
            }
        },
        exporting: {
            enabled: false
        },
        series: [{
                showInLegend: false,
                shadow: {
                    color: 'rgba(255, 255, 0, 0.7)',
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    width: 10
                },
                name: title,
                data: data,
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        if (isCumulative) {
                            return this.point.index === 0 ? formatter(this.y) : null;
                        } else {
                            if (highPoint && this.point.x === highPoint[0] && this.point.y === highPoint[1]) {
                                return `High: ${formatter(this.y)}`;
                            }
                            if (lowPoint && this.point.x === lowPoint[0] && this.point.y === lowPoint[1]) {
                                return `Low: ${formatter(this.y)}`;
                            }
                            return null;
                        }
                    },
                    align: 'right',
                    verticalAlign: 'bottom',
                },
            }
        ],
        credits: {
            enabled: false
        }
    });
}
// Tezos protocol upgrades (activation cycle = TzKT /v1/protocols `firstCycle`).
// Protocol names are alphabetical, so the initial letter doubles as a compact label
// whenever there is not enough horizontal room for the full name.
const PROTOCOL_UPGRADES = [
    { cycle: 112, name: 'Athens' },
    { cycle: 160, name: 'Babylon' },
    { cycle: 208, name: 'Carthage' },
    { cycle: 296, name: 'Delphi' },
    { cycle: 328, name: 'Edo' },
    { cycle: 358, name: 'Florence' },
    { cycle: 388, name: 'Granada' },
    { cycle: 428, name: 'Hangzhou', major: true },
    { cycle: 468, name: 'Ithaca' },
    { cycle: 498, name: 'Jakarta' },
    { cycle: 528, name: 'Kathmandu' },
    { cycle: 558, name: 'Lima' },
    { cycle: 593, name: 'Mumbai' },
    { cycle: 623, name: 'Nairobi' },
    { cycle: 703, name: 'Oxford' },
    { cycle: 743, name: 'Paris', major: true },
    { cycle: 823, name: 'Quebec', major: true },
    { cycle: 858, name: 'Rio' },
    { cycle: 998, name: 'Seoul' },
    { cycle: 1124, name: 'Tallinn' },
    { cycle: 1278, name: 'Ushuaia' }
];
const SAFE_PROTOCOL_NAME = /^[A-Za-z][A-Za-z0-9 .\-]{0,23}$/;
const UPGRADE_LABEL_ROWS = 2;
const UPGRADE_LABEL_GAP = 6;
const UPGRADE_LABEL_ROW_HEIGHT = 14;
let _protocolUpgradesCache = null;
let _labelMeasureCtx = null;
// Hardcoded list is authoritative; newer protocols optionally supplied by the worker
// (`aggregatedDataCache.protocols`) are appended automatically so future upgrades show up.
function getProtocolUpgrades() {
    if (_protocolUpgradesCache)
        return _protocolUpgradesCache;
    const list = PROTOCOL_UPGRADES.map(p => ({ ...p }));
    const remote = aggregatedDataCache?.protocols;
    if (Array.isArray(remote)) {
        remote
            .filter(p => p && Number.isInteger(p.cycle) && typeof p.name === 'string' && SAFE_PROTOCOL_NAME.test(p.name))
            .sort((a, b) => a.cycle - b.cycle)
            .forEach(p => {
                const last = list[list.length - 1];
                // Skip patch releases (e.g. "Paris C") that share the previous protocol's letter
                if (p.cycle > last.cycle && p.name.charAt(0).toUpperCase() !== last.name.charAt(0).toUpperCase()) {
                    list.push({ cycle: p.cycle, name: p.name });
                }
            });
    }
    _protocolUpgradesCache = list;
    return list;
}
function protocolNameForCycle(cycle) {
    const list = getProtocolUpgrades();
    let name = 'Alpha';
    for (let i = 0; i < list.length && list[i].cycle <= cycle; i++)
        name = list[i].name;
    return name;
}
function getUpgradeTickPositions() {
    const ticks = getProtocolUpgrades().map(u => u.cycle);
    if (!ticks.includes(currentCycle))
        ticks.push(currentCycle);
    return ticks.sort((a, b) => a - b);
}
function measureLabelText(text, bold) {
    if (!_labelMeasureCtx)
        _labelMeasureCtx = document.createElement('canvas').getContext('2d');
    _labelMeasureCtx.font = `${bold ? 'bold ' : ''}11px "Monda", Helvetica, Arial, sans-serif`;
    return Math.ceil(_labelMeasureCtx.measureText(text).width);
}
// Collision-free placement on up to UPGRADE_LABEL_ROWS rows, in two passes:
//  1. Coverage: every upgrade gets a slot — "Now"/key upgrades try their full name first,
//     the rest reserve their compact initial letter (protocols are alphabetical).
//  2. Expansion: compact letters are upgraded to full names (on any row) wherever the
//     wider label still doesn't collide with anything already placed.
// Labels that can't fit even as a letter are skipped (tick, guide line and tooltip remain).
function layoutUpgradeLabels(items, chartWidth) {
    const placed = [];
    const span = (item, text) => {
        const half = measureLabelText(text, item.major) / 2;
        const center = Math.min(Math.max(item.px, half + 2), chartWidth - half - 2);
        return { center, left: center - half, right: center + half };
    };
    const fits = (box, row, ignore) => placed.every(p => p === ignore || p.row !== row ||
        box.right + UPGRADE_LABEL_GAP <= p.left || box.left >= p.right + UPGRADE_LABEL_GAP);
    const tryPlace = (item, text) => {
        const box = span(item, text);
        for (let r = 0; r < UPGRADE_LABEL_ROWS; r++) {
            if (fits(box, r, null)) {
                placed.push({ item, text, row: r, ...box });
                return true;
            }
        }
        return false;
    };
    items.forEach(item => {
        if (item.major && tryPlace(item, item.full))
            return;
        tryPlace(item, item.short);
    });
    placed.filter(p => p.text !== p.item.full).forEach(p => {
        const box = span(p.item, p.item.full);
        const rowOrder = [p.row, ...Array.from({ length: UPGRADE_LABEL_ROWS }, (_, r) => r).filter(r => r !== p.row)];
        const row = rowOrder.find(r => fits(box, r, p));
        if (row !== undefined)
            Object.assign(p, { text: p.item.full, row, ...box });
    });
    return placed;
}
function yAtCycle(series, cycle) {
    const pts = series.points || [];
    if (!pts.length)
        return null;
    const guess = pts[cycle - pts[0].x];
    if (guess && guess.x === cycle)
        return guess.y;
    const found = pts.find(p => p.x === cycle);
    return found ? found.y : null;
}
// ---- Intro animation (staking / issuance charts) ----
// Timeline: history draws in and decelerates into "Now", holds for a beat while the
// present-day marker lights up, then the projection extends to the end of the chart.
const PREFERS_REDUCED_MOTION = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const INTRO_DURATION = PREFERS_REDUCED_MOTION ? 700 : 3800;
const INTRO_HISTORY_SHARE = 0.58;
const INTRO_HOLD_SHARE = 0.1;
// `state.nowFrac` = horizontal position of "Now" as a fraction of the plot width. It is refined
// to the exact pixel value in the chart's load event, before the first animation frame runs.
function createIntroTimeline(state) {
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
    const projStart = INTRO_HISTORY_SHARE + INTRO_HOLD_SHARE;
    const ease = PREFERS_REDUCED_MOTION ? easeOutCubic : pos => {
        const nowFrac = state.nowFrac;
        if (pos <= 0)
            return 0;
        if (pos >= 1)
            return 1;
        if (pos < INTRO_HISTORY_SHARE)
            return nowFrac * easeOutCubic(pos / INTRO_HISTORY_SHARE);
        if (pos < projStart)
            return nowFrac;
        return nowFrac + (1 - nowFrac) * easeInOutSine((pos - projStart) / (1 - projStart));
    };
    // Smallest timeline position at which the reveal reaches `frac` (ease is monotonic)
    const inverse = frac => {
        let lo = 0, hi = 1;
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (ease(mid) < frac)
                lo = mid;
            else
                hi = mid;
        }
        return hi;
    };
    return { ease, inverse, duration: INTRO_DURATION };
}
const easeOutBack = t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
function whenElementVisible(el, callback) {
    if (!el || typeof IntersectionObserver !== 'function') {
        callback();
        return;
    }
    const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
            observer.disconnect();
            callback();
        }
    }, { threshold: 0.25 });
    observer.observe(el);
}
function ensureIntroStyles() {
    if (document.getElementById('tez-intro-styles'))
        return;
    const style = document.createElement('style');
    style.id = 'tez-intro-styles';
    style.textContent = `
        @keyframes tezNowPulse { 0% { transform: scale(1); opacity: 0.9; } 100% { transform: scale(4.2); opacity: 0; } }
        .tez-now-pulse { transform-box: fill-box; transform-origin: center; animation: tezNowPulse 2s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tez-now-pulse { animation: none; } }
    `;
    document.head.appendChild(style);
}
// Runs once on chart load: scan line, synced guide reveal, pulse marker fade-in.
function playChartIntro(chart, timeline) {
    const { plotLeft, plotTop, plotWidth, plotHeight } = chart;
    const duration = timeline.duration;
    const nowFrac = Math.min(Math.max((chart.xAxis[0].toPixels(currentCycle) - plotLeft) / plotWidth, 0), 1);
    const nowAt = duration * timeline.inverse(nowFrac);
    // Guide lines are revealed by a clip that grows exactly like the series reveal
    const guideClip = chart.renderer.clipRect(plotLeft, 0, 0, chart.chartHeight);
    chart.upgradeGuides.major.clip(guideClip);
    chart.upgradeGuides.minor.clip(guideClip);
    guideClip.animate({ width: plotWidth + 2 }, { duration, easing: timeline.ease });
    setTimeout(() => {
        if (chart.upgradeGuides && chart.upgradeGuides.major.element) {
            chart.upgradeGuides.major.clip();
            chart.upgradeGuides.minor.clip();
        }
        if (guideClip.element)
            guideClip.destroy();
    }, duration + 80);
    // Present-day marker lights up when the line arrives at "Now"
    if (chart.nowMarker) {
        chart.nowMarker.attr({ opacity: 0 });
        setTimeout(() => {
            if (chart.nowMarker && chart.nowMarker.element)
                chart.nowMarker.animate({ opacity: 1 }, { duration: 500 });
        }, nowAt);
    }
    if (PREFERS_REDUCED_MOTION)
        return;
    // Glowing scan line riding the leading edge of the reveal
    const scan = chart.renderer.g('intro-scan').attr({ zIndex: 6, translateX: plotLeft }).add();
    chart.renderer.rect(-28, plotTop, 28, plotHeight).attr({
        fill: {
            linearGradient: { x1: 0, y1: 0, x2: 1, y2: 0 },
            stops: [[0, 'rgba(255, 255, 160, 0)'], [1, 'rgba(255, 255, 160, 0.16)']]
        }
    }).add(scan);
    chart.renderer.rect(-1, plotTop, 2, plotHeight).attr({
        fill: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(119, 221, 119, 0)'], [0.45, 'rgba(255, 255, 200, 0.95)'], [1, 'rgba(255, 105, 97, 0)']]
        }
    }).add(scan);
    scan.animate({ translateX: plotLeft + plotWidth }, { duration, easing: timeline.ease });
    scan.element.style.transition = 'opacity 0.5s ease-out';
    setTimeout(() => {
        if (scan.element)
            scan.element.style.opacity = '0';
    }, duration);
    setTimeout(() => {
        if (scan.element)
            scan.destroy();
    }, duration + 650);
}
// Draws dashed upgrade guide lines + the multi-row upgrade labels under the x axis.
// Guides are refreshed on every redraw (they follow dragged data); labels are only
// re-laid out when geometry changes, keeping drag interactions smooth.
function drawUpgradeOverlay(chart) {
    const xAxis = chart.xAxis[0];
    const yAxis = chart.yAxis[0];
    const series = chart.series[0];
    if (!xAxis || !yAxis || !series)
        return;
    const ext = xAxis.getExtremes();
    const inRange = c => c >= ext.min && c <= ext.max;
    const upgrades = getProtocolUpgrades().filter(u => inRange(u.cycle));
    const bottom = chart.plotTop + chart.plotHeight;
    const majorPath = [];
    const minorPath = [];
    const addGuide = (cycle, target) => {
        const y = yAtCycle(series, cycle);
        if (y === null || y === undefined)
            return;
        const xPx = xAxis.toPixels(cycle);
        const yPx = Math.max(chart.plotTop, yAxis.toPixels(y));
        if (yPx < bottom)
            target.push(['M', xPx, bottom], ['L', xPx, yPx]);
    };
    upgrades.forEach(u => addGuide(u.cycle, u.major ? majorPath : minorPath));
    if (inRange(currentCycle))
        addGuide(currentCycle, majorPath);
    if (!chart.upgradeGuides) {
        chart.upgradeGuides = {
            major: chart.renderer.path('M 0 0').attr({ 'stroke-width': 1, stroke: '#ffffff', 'stroke-dasharray': '5,5', zIndex: 2 }).add(),
            minor: chart.renderer.path('M 0 0').attr({ 'stroke-width': 1, stroke: 'rgba(255, 255, 255, 0.28)', 'stroke-dasharray': '3,4', zIndex: 2 }).add()
        };
    }
    chart.upgradeGuides.major.attr({ d: majorPath.length ? majorPath : 'M 0 0' });
    chart.upgradeGuides.minor.attr({ d: minorPath.length ? minorPath : 'M 0 0' });

    // Pulsing "you are here" marker on the current cycle
    const nowY = inRange(currentCycle) ? yAtCycle(series, currentCycle) : null;
    if (nowY !== null && nowY !== undefined) {
        const nx = xAxis.toPixels(currentCycle);
        const ny = Math.max(chart.plotTop, yAxis.toPixels(nowY));
        if (!chart.nowMarker) {
            ensureIntroStyles();
            chart.nowMarker = chart.renderer.g('now-marker').attr({ zIndex: 8 }).add();
            chart.nowMarkerRing = chart.renderer.circle(0, 0, 4).attr({
                fill: 'none',
                stroke: '#ffffaa',
                'stroke-width': 1.5,
                'vector-effect': 'non-scaling-stroke',
                'class': 'tez-now-pulse'
            }).add(chart.nowMarker);
            chart.nowMarkerDot = chart.renderer.circle(0, 0, 3.2).attr({ fill: '#ffffff' }).add(chart.nowMarker);
        }
        chart.nowMarkerRing.attr({ cx: nx, cy: ny });
        chart.nowMarkerDot.attr({ cx: nx, cy: ny });
    }

    // One-time intro (timeline is attached in the chart's load event)
    const intro = chart.introTimeline;
    if (intro) {
        chart.introTimeline = null;
        playChartIntro(chart, intro);
    }

    const layoutKey = [chart.chartWidth, chart.plotLeft, chart.plotWidth, bottom, ext.min, ext.max, upgrades.length, currentCycle].join('|');
    if (chart.upgradeLabelKey === layoutKey)
        return;
    chart.upgradeLabelKey = layoutKey;
    if (chart.upgradeLabelGroup)
        chart.upgradeLabelGroup.destroy();
    const group = chart.upgradeLabelGroup = chart.renderer.g('upgrade-labels').attr({ zIndex: 7 }).add();
    const items = upgrades.map(u => ({
        px: xAxis.toPixels(u.cycle),
        full: u.name,
        short: u.name.charAt(0).toUpperCase(),
        major: !!u.major,
        isNow: false,
        title: `${u.name} — activated at cycle ${u.cycle}`
    }));
    if (inRange(currentCycle)) {
        items.push({ px: xAxis.toPixels(currentCycle), full: 'Now', short: 'Now', major: true, isNow: true, title: `Current cycle ${currentCycle}` });
    }
    // Priority: "Now" first, then key economic upgrades, then everything else chronologically
    const ordered = [
        ...items.filter(i => i.isNow),
        ...items.filter(i => i.major && !i.isNow),
        ...items.filter(i => !i.major)
    ];
    layoutUpgradeLabels(ordered, chart.chartWidth).forEach(p => {
        const label = chart.renderer
            .text(escapeHTML(p.text), p.center, bottom + 15 + p.row * UPGRADE_LABEL_ROW_HEIGHT)
            .attr({ align: 'center' })
            .css({
                color: p.item.major ? '#ffffff' : 'rgba(255, 255, 255, 0.72)',
                fontSize: '11px',
                fontWeight: p.item.major ? 'bold' : 'normal',
                cursor: 'default'
            })
            .add(group);
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = p.item.title;
        label.element.appendChild(title);
        // During the intro each label pops in just as the reveal passes its tick
        if (intro) {
            const frac = Math.min(Math.max((p.item.px - chart.plotLeft) / chart.plotWidth, 0), 1);
            const at = PREFERS_REDUCED_MOTION ? intro.duration : intro.duration * intro.inverse(frac);
            label.attr({ opacity: 0, translateY: 9 });
            setTimeout(() => {
                if (label.element)
                    label.animate({ opacity: 1, translateY: 0 }, { duration: p.item.isNow ? 650 : 480, easing: easeOutBack });
            }, at);
        }
    });
}
function createHistoricalCharts(ratio) {
    try {
        const data = aggregatedDataCache.historicalCycleData;
        const issuanceData = processIssuanceData(data);
        const stakingData = processStakingData(data);
        currentCycle = issuanceData.currentCycle;
        tmp = 0.05; // Reset bonus state to current on-chain saturation before projection
        const issuanceDataWithRatio = [...issuanceData.ratios, ...ratio.map((ratioValue, index) => ({
                    cycle: currentCycle + index + 1,
                    issuance: issuanceRateQ(index + currentCycle, ratioValue) /*LB_SUBSIDY / data[currentCycle].totalSupply * 100*/
                }))];
        createHistoricalChart('issuanceh', 'Issuance since genesis', issuanceDataWithRatio, d => ({
                x: d.cycle,
                y: d.issuance
            }), getUpgradeTickPositions());
        const stakingDataWithRatio = [...stakingData.ratios, ...ratio.map((ratioValue, index) => ({
                    cycle: currentCycle + index + 1,
                    staking: 0,
                    ratio: ratioValue
                }))];
        createHistoricalChart('stakingh', 'Staked since genesis', stakingDataWithRatio, d => ({
                x: d.cycle,
                y: (d.staking + (d.ratio || 0)) * 100
            }), getUpgradeTickPositions());
    } catch (error) {
        console.error('Error creating historical charts:', error);
    }
}
function createHistoricalChart(containerId, title, data, dataMapper, tickPositions) {
    const seriesData = data.map(dataMapper);
    const xFirst = seriesData.length ? seriesData[0].x : 0;
    const xLast = seriesData.length ? seriesData[seriesData.length - 1].x : 1;
    const introState = { nowFrac: Math.min(Math.max((currentCycle - xFirst) / Math.max(1, xLast - xFirst), 0.05), 0.95) };
    const introTimeline = createIntroTimeline(introState);
    const chartConfig = {
        chart: {
            type: 'spline',
            backgroundColor: 'rgba(0,0,0,0)',
            // Room for two rows of protocol upgrade labels under the x axis
            marginBottom: 44,
            events: {
                load: function () {
                    // Exact pixel position of "Now" so the reveal pauses precisely on it
                    const nowPx = this.xAxis[0].toPixels(currentCycle);
                    introState.nowFrac = Math.min(Math.max((nowPx - this.plotLeft) / this.plotWidth, 0.02), 0.98);
                    this.introTimeline = introTimeline;
                    drawUpgradeOverlay(this);
                },
                redraw: function () {
                    drawUpgradeOverlay(this);
                }
            }
        },
        title: {
            text: title,
            style: {
                color: '#ffffff'
            }
        },
        xAxis: {
            lineColor: '#ffffff',
            // Labels are rendered by drawUpgradeOverlay() with collision avoidance
            labels: {
                enabled: false
            },
            title: {
                text: null
            },
            tickWidth: 1,
            tickLength: 5,
            tickColor: 'rgba(255, 255, 255, 0.55)',
            tickInterval: 1,
            tickPositions: tickPositions
        },
        yAxis: {
            labels: {
                enabled: false
            },
            gridLineWidth: 0,
            title: {
                text: null
            },
            min: 0,
            max: containerId === 'issuanceh' ? 11 : 60,
            tickInterval: 1
        },
        tooltip: {
            formatter: function () {
                const label = containerId === 'issuanceh' ? 'Issuance' : 'Staking (frozen tez)';
                const era = this.x > currentCycle ? 'Projection' : escapeHTML(protocolNameForCycle(this.x));
                return `Cycle: ${this.x} <span style="opacity:0.7">· ${era}</span><br><span style="color:${this.point.color}">●</span> ${label}: <b>${this.y.toFixed(2)}%</b><br/>`;
            }
        },
        series: [{
                zoneAxis: 'x',
                zones: [{
                        value: (currentCycle + 1)
                    }, {
                        dashStyle: 'ShortDot'
                    }
                ],
                showInLegend: false,
                shadow: {
                    color: 'rgba(255, 255, 0, 0.7)',
                    offsetX: 0,
                    offsetY: 0,
                    opacity: 1,
                    width: 10
                },
                color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
                    stops: containerId === 'issuanceh' ? [[0, '#ff6961'], [1, '#77dd77']] : [[0, '#77dd77'], [1, '#ff6961']]
                },
                name: title,
                data: seriesData,
                // Cinematic reveal; overlays (scan line, guides, labels) share this timeline
                animation: {
                    duration: introTimeline.duration,
                    easing: introTimeline.ease
                },
                lineWidth: 1.5,
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        if (this.point.index === this.series.data.length - 1 || this.point.x === currentCycle) {
                            return `${this.y.toFixed(2)}%`;
                        }
                        return null;
                    },
                    align: 'right',
                    verticalAlign: 'bottom',
                },
                marker: {
                    enabled: false
                },
            }
        ],
        credits: {
            enabled: false
        }
    };
    if (containerId === 'stakingh') {
        chartConfig.plotOptions = {
            series: {
                color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
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
                        drag: function (e) {
                            const point = e.target;
                            if (point.x <= currentCycle + 1) {
                                e.newPoint.y = point.y;
                                return;
                            }
                            // #2: Pause star animations during drag
                            if (!window._starsPaused) {
                                document.body.classList.add('dragging-active');
                                window._starsPaused = true;
                            }
                            const newValue = parseFloat(e.newPoint.y);
                            const series = point.series;
                            // #1: Direct point mutation instead of setData
                            for (let i = point.index; i < series.data.length; i++) {
                                series.data[i].y = newValue;
                                series.data[i].options.y = newValue;
                            }
                            series.isDirty = true;
                            series.isDirtyData = true;
                            series.chart.redraw(false);
                            // Update issuance with new staking values
                            updateIssuanceChartFast(series.data, false);
                        },
                        drop: function (e) {
                            const point = e.target;
                            // #2: Resume star animations
                            document.body.classList.remove('dragging-active');
                            window._starsPaused = false;
                            if (point.x <= currentCycle + 1) return;
                            
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
                            updateIssuanceChartFast(series.data, { duration: 800, easing: 'easeOutBounce' });
                        }
                    }
                }
            }
        };
    }
    // Build (and animate) only once the chart scrolls into view so the intro is actually seen
    whenElementVisible(document.getElementById(containerId), () => Highcharts.chart(containerId, chartConfig));
}
// #7: Cache both chart references
let _issuanceChartCache = null;
let _stakingChartCache = null;
// #8: Pre-allocated array for issuance updates (avoids GC pressure)
let _issuanceUpdateBuffer = null;

function updateIssuanceChartFast(stakingData, animation) {
    // #7: Cached chart lookup
    if (!_issuanceChartCache || !_issuanceChartCache.renderTo) {
        _issuanceChartCache = Highcharts.charts.find(chart => chart && chart.renderTo && chart.renderTo.id === 'issuanceh');
    }
    const issuanceChart = _issuanceChartCache;
    if (!issuanceChart)
        return;
    tmp = 0.05; // Reset bonus state to current on-chain saturation before projection
    const originalData = issuanceChart.series[0].options.data;

    // #8: Pre-allocate buffer once, reuse on every drag tick
    if (!_issuanceUpdateBuffer || _issuanceUpdateBuffer.length !== originalData.length) {
        _issuanceUpdateBuffer = originalData.map(p => ({ x: p.x, y: p.y }));
    }

    // #3: Build staking lookup only for future cycles
    const stakingMap = new Map();
    for (let i = 0; i < stakingData.length; i++) {
        const sp = stakingData[i];
        const x = sp.x !== undefined ? sp.x : sp.options?.x;
        const y = sp.y !== undefined ? sp.y : sp.options?.y;
        if (x > currentCycle) stakingMap.set(x, y);
    }

    // #3: Only recalculate future points, copy historical as-is
    for (let i = 0; i < originalData.length; i++) {
        const point = originalData[i];
        _issuanceUpdateBuffer[i].x = point.x;
        if (point.x > currentCycle) {
            const stakingY = stakingMap.get(point.x);
            if (stakingY !== undefined) {
                _issuanceUpdateBuffer[i].y = issuanceRateQ(point.x, stakingY / 100);
                continue;
            }
        }
        _issuanceUpdateBuffer[i].y = point.y;
    }
    issuanceChart.series[0].setData(_issuanceUpdateBuffer, true, animation);
}
// Keep legacy function for createHistoricalCharts initial call
function updateIssuanceChart(newStakingData, animation = true) {
    _issuanceUpdateBuffer = null; // Force buffer rebuild
    updateIssuanceChartFast(newStakingData, animation);
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
        ratios.push({
            cycle: curr.cycle,
            issuance: annualized
        });
    }
    return {
        ratios,
        currentCycle: data[data.length - 1].cycle
    };
}
function processStakingData(data) {
    return {
        ratios: data.slice(1).map(curr => ({
                cycle: curr.cycle,
                staking: (curr.cycle >= 822 && (curr.totalOwnStaked || curr.totalExternalStaked)
                    ? curr.totalOwnStaked + curr.totalExternalStaked
                    : curr.totalFrozen) / curr.totalSupply
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
        const targetProtocols = ["Midas RWA", "Uranium.io", "Spiko"];
        specificProtocolsTVL = 0;
        projects.forEach((project, index) => {
            if (targetProtocols.includes(project)) {
                specificProtocolsTVL += tvlValues[index];
            }
        });
        const generateUniqueHue = (index, total) => {
            const goldenRatio = 0.618033988749895;
            return (index * goldenRatio * 360) % 360;
        };
        const pieData = projects.map((project, index) => {
            const hue = generateUniqueHue(index, projects.length);
            const saturation = 75 + (index % 3) * 10;
            const lightness = 55 + (index % 4) * 5;
            return {
                name: `${escapeHTML(project)}`,
                y: tvlValues[index],
                color: {
                    radialGradient: {
                        cx: 0.5,
                        cy: 0.5,
                        r: 0.8
                    },
                    stops: [[0, `hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.9)`], [0.5, `hsla(${hue}, ${saturation - 10}%, ${lightness}%, 0.8)`], [1, `hsla(${hue}, ${saturation - 20}%, ${lightness - 15}%, 0.7)`]]
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
                text: 'DeFi NET TVL (+RWA)',
                style: {
                    color: '#ffffff',
                    fontSize: '24px'
                }
            },
            subtitle: {
                text: `Total: $${totalTVL.toLocaleString()}`,
                style: {
                    color: '#22c55e',
                    fontSize: '16px'
                }
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
                            brightness: 0.1
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
                            textOutline: '1px contrast'
                        },
                        distance: 20
                    },
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderWidth: 2
                }
            ],
            exporting: {
                enabled: false
            },
            credits: {
                enabled: false
            }
        });
    } catch (error) {
        console.error('Error creating TVL chart:', error);
    }
}
function createConsensusKeyAdoptionChart() {
    try {
        const data = aggregatedDataCache.consensusKeyAdoptionData;
        
        if (!data || data.length === 0) {
            console.error('No consensus key adoption data available');
            return;
        }
        
        const filteredData = data.filter(item => item.cycle >= 990);
        
        const chartData = filteredData.map(item => ({
            x: item.cycle,
            y: item.tz4_adoption_percentage
        }));
        
        Highcharts.chart('chart-container6', {
            chart: {
                type: 'spline',
                backgroundColor: 'rgba(0,0,0,0)',
            },
            title: {
                text: 'BLS support',
                style: {
                    color: '#ffffff'
                }
            },
            xAxis: {
                lineColor: '#ffffff',
                lineWidth: 1,
                labels: {
                    enabled: false
                }
            },
            yAxis: {
                gridLineWidth: 0,
                title: {
                    text: null
                },
                labels: {
                    enabled: false
                },
                plotLines: [{
                        color: '#ffffff',
                        width: 2,
                        value: 0.50,
                        dashStyle: 'dot',
                        zIndex: 5,
                        label: {
                            text: 'Target (50%)',
                            align: 'left',
                            style: {
                                color: '#ffffff',
                                fontWeight: 'bold'
                            },
                            x: 10,
                            y: -10
                        }
                    }
                ]
            },
            tooltip: {
                formatter: function () {
                    return `Cycle: ${this.x}<br><span style="color:${this.point.color}">●</span> BLS Support: <b>${(this.y * 100).toFixed(2)}% of active bakers</b><br/>`;
                }
            },
            series: [{
                    shadow: {
                        color: 'rgba(100, 150, 255, 0.7)',
                        offsetX: 0,
                        offsetY: 0,
                        opacity: 1,
                        width: 10
                    },
                    name: "TZ4 Adoption",
                    showInLegend: false,
                    data: chartData,
                    dataLabels: {
                        enabled: true,
                        formatter: function () {
                            if (this.point.index === this.series.data.length - 1) {
                                return `${(this.y * 100).toFixed(2)}%`;
                            }
                            return null;
                        },
                        align: 'right',
                        verticalAlign: 'bottom',
                    },
                    lineWidth: 2,
                    marker: {
                        enabled: false
                    },
                    color: {
                        linearGradient: {
                            x1: 0,
                            y1: 0,
                            x2: 0,
                            y2: 1
                        },
                        stops: [[0, '#77dd77'], [1, '#ff6961']]
                    }
                }
            ],
            credits: {
                enabled: false
            }
        });
    } catch (error) {
        console.error('Error loading consensus key adoption data:', error);
    }
}
async function createEcosystemChart() {
    try {
        if (window.ecosystemChart) {
            window.ecosystemChart.destroy();
            window.ecosystemChart = null;
        }
        if (window.ecosystemResizeHandler) {
            window.removeEventListener('resize', window.ecosystemResizeHandler);
            window.ecosystemResizeHandler = null;
        }
        const oldTooltip = document.getElementById('custom-tooltip');
        if (oldTooltip) oldTooltip.remove();
        const oldControls = document.getElementById('eco-controls-bar');
        if (oldControls) oldControls.remove();

        let projects = null;
        try {
            const ecoResp = await fetch('ecosystem.json');
            if (ecoResp && ecoResp.ok) {
                const ecoJson = await ecoResp.json();
                if (ecoJson && Array.isArray(ecoJson.ecosystem) && ecoJson.ecosystem.length > 0) {
                    projects = ecoJson.ecosystem;
                }
            }
        } catch (e) {
            try {
                const ecoJson = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', 'ecosystem.json', true);
                    xhr.onload = () => {
                        if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) {
                            try { resolve(JSON.parse(xhr.responseText)); } catch (err) { reject(err); }
                        } else {
                            reject(new Error('XHR status ' + xhr.status));
                        }
                    };
                    xhr.onerror = () => reject(new Error('XHR error'));
                    xhr.send();
                });
                if (ecoJson && Array.isArray(ecoJson.ecosystem) && ecoJson.ecosystem.length > 0) {
                    projects = ecoJson.ecosystem;
                }
            } catch (e2) {}
        }

        if (!projects || projects.length === 0) {
            projects = (typeof aggregatedDataCache !== 'undefined' && aggregatedDataCache && Array.isArray(aggregatedDataCache.ecosystemProjects))
                ? aggregatedDataCache.ecosystemProjects
                : [];
        } else if (typeof aggregatedDataCache !== 'undefined' && aggregatedDataCache) {
            aggregatedDataCache.ecosystemProjects = projects;
        }

        const container = document.getElementById('ecosystem-chart-container');
        if (!container) return;
        if (!projects || projects.length === 0) {
            console.error('No ecosystem projects data available');
            container.innerHTML = '<div style="color: #ff6961; text-align: center; padding: 50px;">No ecosystem data available</div>';
            return;
        }

        const tagMap = {
            defi: 'defi',
            etherlink: 'defi',
            stablecoins: 'defi',
            rwa: 'defi',
            gaming: 'gaming',
            nft: 'nft',
            nfts: 'nft',
            community: 'community',
            did: 'community',
            social: 'community',
            tooling: 'tooling',
            devtools: 'tooling',
            'dev-tools': 'tooling',
            baking: 'tooling',
            blockexplorers: 'tooling',
            education: 'tooling',
            wallet: 'tooling',
            'tezos-wallet': 'tooling',
            infra: 'tooling'
        };

        const categoryColors = {
            defi: '#6CDDCA',
            gaming: '#C771F3',
            nft: '#4D90DB',
            community: '#FAB776',
            tooling: '#FF6B9D'
        };

        const categoryNames = {
            defi: 'DeFi',
            gaming: 'Gaming',
            nft: 'NFT',
            community: 'Community',
            tooling: 'Tooling & Infra'
        };

        const categoryOrder = ['defi', 'gaming', 'nft', 'community', 'tooling'];
        const grouped = { defi: [], gaming: [], nft: [], community: [], tooling: [] };
        const uniqueSet = new Set();

        projects.forEach(item => {
            const f = item && item.fields ? item.fields : {};
            if (f.Tags && f.Tags.length > 0 && f.Status === 'active' && f.Project && !uniqueSet.has(f.Project)) {
                let cat = null;
                if (/wallet/i.test(f.Project)) {
                    cat = 'tooling';
                } else {
                    for (const rawTag of f.Tags) {
                        if (rawTag !== 'partner') {
                            cat = tagMap[rawTag] || (grouped[rawTag] ? rawTag : 'tooling');
                            break;
                        }
                    }
                }
                if (cat && grouped[cat]) {
                    grouped[cat].push(item);
                    uniqueSet.add(f.Project);
                }
            }
        });

        const activeCategories = categoryOrder.filter(cat => grouped[cat] && grouped[cat].length > 0);
        const totalProjects = uniqueSet.size;

        const weights = activeCategories.map(cat => Math.pow(Math.max(10, grouped[cat].length), 0.75));
        const weightSum = weights.reduce((a, b) => a + b, 0);
        const sectorAngles = weights.map(w => (w / weightSum) * 360);

        const tickPositions = [0];
        const sectorBounds = {};
        let runningAngle = 0;
        activeCategories.forEach((cat, idx) => {
            const span = sectorAngles[idx];
            sectorBounds[cat] = { start: runningAngle, span: span, end: runningAngle + span };
            runningAngle += span;
            tickPositions.push(idx === activeCategories.length - 1 ? 360 : Number(runningAngle.toFixed(3)));
        });

        const vw = window.innerWidth;
        const bubbleSize = vw < 480 ? 15 : vw < 640 ? 18 : vw < 768 ? 22 : vw < 1024 ? 26 : 31;
        const baseOrigin = (window.location.origin && window.location.origin.startsWith('http'))
            ? window.location.origin
            : 'https://tez.cool';

        const bubbleData = [];

        activeCategories.forEach(cat => {
            const items = grouped[cat].slice().sort((a, b) => {
                const fa = a.fields.IsFeatured ? 1 : 0;
                const fb = b.fields.IsFeatured ? 1 : 0;
                if (fa !== fb) return fb - fa;
                return String(a.fields.Project).localeCompare(String(b.fields.Project));
            });
            const N = items.length;
            const { start, span } = sectorBounds[cat];

            const numRings = N >= 42 ? 6 : N >= 26 ? 5 : N >= 11 ? 4 : N >= 5 ? 3 : 2;
            const yMin = numRings >= 6 ? 20.5 : numRings === 5 ? 22.0 : 24.0;
            const yMax = numRings >= 6 ? 65.5 : numRings === 5 ? 64.5 : 63.0;

            const ringRadii = [];
            for (let r = 0; r < numRings; r++) {
                ringRadii.push(numRings === 1 ? 42 : yMin + (r / (numRings - 1)) * (yMax - yMin));
            }

            const ringWeights = ringRadii.map(y => Math.pow(y + 8, 0.86));
            const rwSum = ringWeights.reduce((a, b) => a + b, 0);
            const exactCounts = ringWeights.map(w => (w / rwSum) * N);
            const ringCounts = exactCounts.map(c => Math.max(1, Math.floor(c)));
            let diff = N - ringCounts.reduce((a, b) => a + b, 0);

            const fracOrder = exactCounts
                .map((c, idx) => ({ idx, frac: c - Math.floor(c) }))
                .sort((a, b) => b.frac - a.frac);

            let guard = 0;
            while (diff > 0 && guard++ < 100) {
                for (const f of fracOrder) {
                    if (diff <= 0) break;
                    ringCounts[f.idx]++;
                    diff--;
                }
            }
            while (diff < 0 && guard++ < 200) {
                for (let i = fracOrder.length - 1; i >= 0; i--) {
                    if (diff >= 0) break;
                    const idx = fracOrder[i].idx;
                    if (ringCounts[idx] > 1) {
                        ringCounts[idx]--;
                        diff++;
                    }
                }
            }

            const padDeg = Math.min(span * 0.065, 3.6);
            const usableSpan = Math.max(4, span - 2 * padDeg);

            let cursor = 0;
            for (let r = 0; r < numRings; r++) {
                const countInRing = ringCounts[r];
                const yVal = ringRadii[r];
                const stagger = countInRing > 2 ? (r % 2 === 1 ? 0.16 : -0.16) : 0;

                for (let s = 0; s < countInRing && cursor < N; s++, cursor++) {
                    const item = items[cursor];
                    const frac = (s + 0.5 + stagger) / countInRing;
                    const clampedFrac = Math.max(0.04, Math.min(0.96, frac));
                    const xVal = start + padDeg + clampedFrac * usableSpan;

                    let logoUrl = null;
                    if (item.fields.Logo && item.fields.Logo.length > 0 && item.fields.Logo[0].url) {
                        const rawUrl = item.fields.Logo[0].url;
                        logoUrl = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))
                            ? rawUrl
                            : rawUrl.replace(/^\//, '');
                    }

                    bubbleData.push({
                        name: item.fields.Project,
                        x: Number(xVal.toFixed(3)),
                        y: Number(yVal.toFixed(3)),
                        z: bubbleSize,
                        color: categoryColors[cat] || '#999999',
                        custom: {
                            tag: cat,
                            displayTag: categoryNames[cat] || cat,
                            logline: item.fields.Logline || '',
                            website: item.fields.Website || '',
                            tags: item.fields.Tags || [],
                            featured: !!item.fields.IsFeatured,
                            logoUrl: logoUrl
                        }
                    });
                }
            }
        });

        const pieData = activeCategories.map((cat, idx) => ({
            y: Number(sectorAngles[idx].toFixed(3)),
            color: categoryColors[cat] || '#999999',
            name: categoryNames[cat] || cat,
            custom: {
                tag: cat,
                displayTag: categoryNames[cat] || cat,
                count: grouped[cat].length
            }
        }));

        let lockedCategory = null;
        let hoveredSector = null;
        let pillPreviewCategory = null;
        let searchQuery = '';
        let lastAppliedSignature = null;

        function getSectorFromPointerEvent(ev, chart) {
            if (!chart || !chart.pane || !chart.pane[0] || !chart.container) return null;
            const svgRect = chart.container.getBoundingClientRect();
            const mx = ev.clientX - svgRect.left;
            const my = ev.clientY - svgRect.top;
            const cx = chart.pane[0].center[0] + chart.plotLeft;
            const cy = chart.pane[0].center[1] + chart.plotTop;
            const dx = mx - cx;
            const dy = my - cy;
            const dist = Math.hypot(dx, dy);
            const paneDiam = chart.pane[0].center[2] || Math.min(chart.plotWidth, chart.plotHeight);
            const outerR = paneDiam / 2;
            const innerHoleR = outerR * 0.20;
            if (dist < innerHoleR || dist > outerR * 1.02) {
                return null;
            }
            const angleDeg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
            for (const cat of activeCategories) {
                const b = sectorBounds[cat];
                if (b && angleDeg >= b.start && angleDeg <= b.end) {
                    return cat;
                }
            }
            return null;
        }

        function updateCenterLabel(countVal, titleText, chart, existingLabel) {
            const html = `
                <div style="text-align: center; pointer-events: none;">
                    <div style="font-size: ${window.innerWidth < 480 ? '20px' : window.innerWidth < 768 ? '28px' : '46px'}; font-weight: 600; color: #ffffff; line-height: 1;">
                        ${countVal}
                    </div>
                    <div style="font-size: ${window.innerWidth < 480 ? '6px' : window.innerWidth < 768 ? '10px' : '13px'}; color: rgba(255, 255, 255, 0.72); margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">
                        ${titleText}
                    </div>
                </div>
            `;
            const lbl = existingLabel
                ? existingLabel.attr({ text: html })
                : chart.renderer.label(html, 0, 0, void 0, void 0, void 0, true)
                    .css({ color: '#ffffff', pointerEvents: 'none' })
                    .attr({ zIndex: 0 })
                    .add();
            lbl.attr({
                x: chart.pane[0].center[0] + chart.plotLeft - lbl.attr('width') / 2,
                y: chart.pane[0].center[1] + chart.plotTop - lbl.attr('height') / 2,
                zIndex: 0
            });
            return lbl;
        }

        function applyFilterState(chart, forceUpdate) {
            if (!chart || !chart.series || !chart.series[0]) return;
            const activeCat = pillPreviewCategory || hoveredSector || lockedCategory;
            const q = searchQuery.trim().toLowerCase();
            const signature = `${activeCat || ''}|${q}`;
            if (!forceUpdate && signature === lastAppliedSignature) return;
            lastAppliedSignature = signature;

            const pts = chart.series[0].points;
            const pieSeries = chart.series[1];

            let matchCount = 0;
            pts.forEach(pt => {
                const matchesCat = !activeCat || pt.custom.tag === activeCat;
                const matchesQuery = !q ||
                    pt.name.toLowerCase().includes(q) ||
                    (pt.custom.logline && pt.custom.logline.toLowerCase().includes(q)) ||
                    (pt.custom.displayTag && pt.custom.displayTag.toLowerCase().includes(q));
                const visible = matchesCat && matchesQuery;
                if (visible) matchCount++;

                const targetOpacity = (!activeCat && !q) ? 1 : (visible ? 1 : 0.14);
                if (pt.customImageGroup) {
                    pt.customImageGroup.attr({ opacity: targetOpacity });
                } else if (pt.graphic) {
                    pt.graphic.attr({ opacity: targetOpacity });
                }
            });

            if (pieSeries) {
                pieSeries.points.forEach(slice => {
                    const sliceActive = !activeCat || slice.options.custom.tag === activeCat;
                    if (slice.graphic) {
                        slice.graphic.attr({ opacity: sliceActive ? 1 : 0.25 });
                    }
                });
                if (q) {
                    pieSeries.customLabel = updateCenterLabel(matchCount, 'MATCHING', chart, pieSeries.customLabel);
                } else if (activeCat) {
                    const catCount = grouped[activeCat] ? grouped[activeCat].length : matchCount;
                    pieSeries.customLabel = updateCenterLabel(catCount, (categoryNames[activeCat] || activeCat).toUpperCase(), chart, pieSeries.customLabel);
                } else {
                    pieSeries.customLabel = updateCenterLabel(totalProjects, 'TOTAL PROJECTS', chart, pieSeries.customLabel);
                }
            }
        }

        function bindSectorBoundaryTracking(chart) {
            if (!chart || !chart.container || chart._sectorBoundaryBound) return;
            chart._sectorBoundaryBound = true;
            chart.container.addEventListener('mousemove', function (ev) {
                const sec = getSectorFromPointerEvent(ev, chart);
                if (sec !== hoveredSector) {
                    hoveredSector = sec;
                    applyFilterState(chart, false);
                }
            });
            chart.container.addEventListener('mouseleave', function () {
                if (hoveredSector !== null) {
                    hoveredSector = null;
                    applyFilterState(chart, false);
                }
                const tip = document.getElementById('custom-tooltip');
                if (tip) tip.style.display = 'none';
            });
        }

        function renderCustomLogos(chart) {
            const series = chart.series[0];
            if (chart.customLogoGroups) chart.customLogoGroups.forEach(g => g.destroy());
            chart.customLogoGroups = [];
            if (chart.customClipPaths) chart.customClipPaths.forEach(cp => cp.destroy());
            chart.customClipPaths = [];

            series.points.forEach(pt => {
                if (!pt.custom || !pt.custom.logoUrl || !pt.graphic) return;
                const logoUrl = pt.custom.logoUrl;
                const diam = Math.max(12, 2 * (pt.marker && pt.marker.radius ? pt.marker.radius : bubbleSize / 2));
                const cx = pt.plotX + chart.plotLeft;
                const cy = pt.plotY + chart.plotTop;

                const grp = chart.renderer.g()
                    .attr({ zIndex: 5, 'class': 'clickable-logo' })
                    .css({ cursor: 'pointer', transition: 'opacity 0.16s ease' })
                    .add();
                chart.customLogoGroups.push(grp);

                grp.element.addEventListener('click', function () {
                    if (pt.custom && pt.custom.website) {
                        window.open(pt.custom.website, '_blank');
                    }
                });

                grp.element.addEventListener('mouseenter', function () {
                    if (pt.customBorderCircle) {
                        pt.customBorderCircle.attr({ opacity: 1, 'stroke-width': 2.5 });
                    }
                    if (hoveredSector !== pt.custom.tag) {
                        hoveredSector = pt.custom.tag;
                        applyFilterState(chart, false);
                    }
                    const tip = document.getElementById('custom-tooltip');
                    if (!tip) return;
                    const imgHtml = pt.custom.logoUrl
                        ? `<img src="${escapeHTML(pt.custom.logoUrl)}" style="width: 34px; height: 34px; border-radius: 8px; margin-bottom: 8px; background: white; padding: 2px; object-fit: cover;" onerror="this.style.display='none'" />`
                        : '';
                    tip.innerHTML = `
                        ${imgHtml}
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #ffffff;">
                            ${escapeHTML(pt.name)}
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.76); font-size: 12px; line-height: 1.35; margin-bottom: 6px;">
                            ${escapeHTML(pt.custom.logline)}
                        </div>
                        <div style="color: ${pt.color}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${escapeHTML(pt.custom.displayTag)}
                        </div>
                    `;
                    tip.style.display = 'block';
                });

                grp.element.addEventListener('mousemove', function (ev) {
                    const tip = document.getElementById('custom-tooltip');
                    if (!tip) return;
                    const rect = container.getBoundingClientRect();
                    let left = ev.clientX - rect.left + 12;
                    let top = ev.clientY - rect.top + 12;
                    const tw = tip.offsetWidth;
                    const th = tip.offsetHeight;
                    if (left + tw > rect.width) left = ev.clientX - rect.left - tw - 12;
                    if (top + th > rect.height) top = ev.clientY - rect.top - th - 12;
                    if (left < 0) left = 10;
                    if (top < 0) top = 10;
                    tip.style.left = left + 'px';
                    tip.style.top = top + 'px';
                });

                grp.element.addEventListener('mouseleave', function () {
                    if (pt.customBorderCircle) {
                        pt.customBorderCircle.attr({ opacity: 0.55, 'stroke-width': 1.5 });
                    }
                    const tip = document.getElementById('custom-tooltip');
                    if (tip) tip.style.display = 'none';
                });

                pt.customImageGroup = grp;
                const clipId = 'clip-' + pt.index + '-' + Math.random().toString(36).slice(2, 8);
                const clipPath = chart.renderer.createElement('clipPath').attr({ id: clipId }).add(chart.renderer.defs);
                chart.customClipPaths.push(clipPath);
                chart.renderer.circle(0, 0, diam / 2).add(clipPath);

                chart.renderer.circle(cx, cy, diam / 2).attr({ fill: '#ffffff' }).add(grp);

                const imgClipGroup = chart.renderer.g()
                    .attr({ 'clip-path': `url(#${clipId})`, transform: `translate(${cx}, ${cy})` })
                    .add(grp);

                const svgImg = chart.renderer.image(logoUrl, -diam / 2, -diam / 2, diam, diam)
                    .attr({ preserveAspectRatio: 'xMidYMid slice' })
                    .add(imgClipGroup);

                if (svgImg && svgImg.element) {
                    svgImg.element.addEventListener('error', function () {
                        svgImg.attr({ visibility: 'hidden' });
                    });
                }

                const borderCircle = chart.renderer.circle(cx, cy, diam / 2)
                    .attr({
                        fill: 'none',
                        stroke: pt.color || 'rgba(255, 255, 255, 0.45)',
                        'stroke-width': 1.5,
                        opacity: 0.55
                    })
                    .add(grp);
                pt.customBorderCircle = borderCircle;
                if (pt.graphic) pt.graphic.attr({ opacity: 0 });
            });

            applyFilterState(chart, true);
        }

        function buildControlsBar(chart) {
            let bar = document.getElementById('eco-controls-bar');
            if (bar) bar.remove();
            bar = document.createElement('div');
            bar.id = 'eco-controls-bar';

            const headerWrap = document.createElement('div');
            headerWrap.style.cssText = 'text-align: center; padding: 8px 10px 4px;';
            const titleEl = document.createElement('div');
            titleEl.style.cssText = `color: #ffffff; font-size: ${vw < 768 ? '20px' : '28px'}; font-family: "Monda", Helvetica, sans-serif; font-weight: 500; line-height: 1.2; margin-bottom: 6px;`;
            titleEl.textContent = 'Tezos Ecosystem Map';
            const subEl = document.createElement('div');
            subEl.style.cssText = `color: rgba(255, 255, 255, 0.7); font-family: "Monda", Helvetica, sans-serif; font-size: ${vw < 768 ? '11px' : '12px'}; margin-bottom: 10px;`;
            subEl.textContent = vw < 768
                ? 'Tap category pills to filter \u00b7 Tap logos to visit websites'
                : 'Projects organized by category \u00b7 Filter by category or click logos to visit websites';
            headerWrap.appendChild(titleEl);
            headerWrap.appendChild(subEl);
            bar.appendChild(headerWrap);

            const pillRow = document.createElement('div');
            pillRow.className = 'eco-controls-bar';

            const pills = [];
            function syncPillsUI() {
                pills.forEach(p => {
                    const isAll = p.dataset.cat === '';
                    const isActive = isAll ? !lockedCategory : lockedCategory === p.dataset.cat;
                    p.classList.toggle('active', isActive);
                });
            }

            const allPill = document.createElement('button');
            allPill.type = 'button';
            allPill.className = 'eco-cat-pill active';
            allPill.dataset.cat = '';
            allPill.innerHTML = `<span>All</span><span class="eco-cat-count">${totalProjects}</span>`;
            allPill.addEventListener('click', () => {
                lockedCategory = null;
                pillPreviewCategory = null;
                syncPillsUI();
                applyFilterState(chart, false);
            });
            pillRow.appendChild(allPill);
            pills.push(allPill);

            activeCategories.forEach(cat => {
                const pill = document.createElement('button');
                pill.type = 'button';
                pill.className = 'eco-cat-pill';
                pill.dataset.cat = cat;
                const col = categoryColors[cat] || '#a27cee';
                pill.style.setProperty('--pill-color', col);
                pill.style.setProperty('--pill-glow', col + '55');
                pill.innerHTML = `
                    <span class="eco-cat-dot" style="background:${col}; color:${col};"></span>
                    <span>${escapeHTML(categoryNames[cat] || cat)}</span>
                    <span class="eco-cat-count">${grouped[cat].length}</span>
                `;
                pill.addEventListener('mouseenter', () => {
                    if (!lockedCategory) {
                        pillPreviewCategory = cat;
                        applyFilterState(chart, false);
                    }
                });
                pill.addEventListener('mouseleave', () => {
                    if (pillPreviewCategory === cat) {
                        pillPreviewCategory = null;
                        applyFilterState(chart, false);
                    }
                });
                pill.addEventListener('click', () => {
                    lockedCategory = lockedCategory === cat ? null : cat;
                    pillPreviewCategory = null;
                    syncPillsUI();
                    applyFilterState(chart, false);
                });
                pillRow.appendChild(pill);
                pills.push(pill);
            });

            const searchInput = document.createElement('input');
            searchInput.type = 'search';
            searchInput.className = 'eco-search-input';
            searchInput.placeholder = 'Search projects...';
            searchInput.setAttribute('aria-label', 'Search ecosystem projects');
            searchInput.addEventListener('input', () => {
                searchQuery = searchInput.value || '';
                applyFilterState(chart, false);
            });
            pillRow.appendChild(searchInput);
            bar.appendChild(pillRow);

            container.insertBefore(bar, container.firstChild);
        }

        const chartConfig = {
            chart: {
                type: 'bubble',
                polar: true,
                height: vw < 768 ? 500 : 940,
                backgroundColor: 'rgba(0,0,0,0)',
                events: {
                    load() {
                        const chart = this;
                        container.style.position = 'relative';
                        const customTooltip = document.createElement('div');
                        customTooltip.id = 'custom-tooltip';
                        customTooltip.style.cssText = `
                            position: absolute;
                            display: none;
                            background: rgba(15, 10, 35, 0.96);
                            border: 1px solid rgba(255, 255, 255, 0.26);
                            border-radius: 16px;
                            padding: 10px 12px;
                            color: white;
                            font-family: "Monda", Helvetica;
                            z-index: 10000;
                            pointer-events: none;
                            max-width: 260px;
                            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
                        `;
                        container.appendChild(customTooltip);
                        window.ecosystemChart = chart;
                        buildControlsBar(chart);
                        bindSectorBoundaryTracking(chart);
                        renderCustomLogos(chart);
                    },
                    redraw() {
                        renderCustomLogos(this);
                    },
                    render() {
                        const pieSeries = this.series[1];
                        if (pieSeries && !lastAppliedSignature) {
                            pieSeries.customLabel = updateCenterLabel(totalProjects, 'TOTAL PROJECTS', this, pieSeries.customLabel);
                        }
                    }
                }
            },
            title: { text: null },
            subtitle: { text: null },
            legend: { enabled: false },
            pane: {
                startAngle: 0,
                innerSize: vw < 768 ? '32%' : '27%',
                size: vw < 480 ? '98%' : '95%',
                background: [
                    {
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.1)'
                    },
                    {
                        backgroundColor: 'rgba(255, 255, 255, 0.01)',
                        borderWidth: 0,
                        outerRadius: vw < 768 ? '32%' : '27%'
                    }
                ]
            },
            xAxis: {
                tickPositions: tickPositions,
                min: 0,
                max: 360,
                gridLineWidth: 1,
                gridLineColor: 'rgba(255, 255, 255, 0.18)',
                labels: { enabled: false },
                lineWidth: 0
            },
            yAxis: {
                tickInterval: 10,
                labels: { enabled: false },
                gridLineWidth: 0.5,
                gridLineColor: 'rgba(255, 255, 255, 0.07)',
                gridLineDashStyle: 'longdash',
                endOnTick: false,
                min: 15,
                max: 71
            },
            tooltip: { enabled: false },
            plotOptions: {
                series: {
                    cursor: 'pointer',
                    point: {
                        events: {
                            click: function () {
                                if (this.custom && this.custom.website) {
                                    window.open(this.custom.website, '_blank');
                                }
                            }
                        }
                    },
                    states: {
                        inactive: { enabled: false },
                        hover: { halo: false }
                    }
                },
                bubble: {
                    minSize: vw < 480 ? 11 : vw < 640 ? 14 : vw < 768 ? 18 : vw < 1024 ? 22 : 28,
                    maxSize: vw < 480 ? 14 : vw < 640 ? 17 : vw < 768 ? 21 : vw < 1024 ? 25 : 31
                },
                pie: {
                    startAngle: 0,
                    states: { hover: { halo: 0 } }
                }
            },
            series: [
                {
                    name: 'Projects',
                    data: bubbleData
                },
                {
                    type: 'pie',
                    dataLabels: { enabled: false },
                    size: vw < 768 ? '29%' : '25%',
                    innerSize: '84%',
                    zIndex: -1,
                    point: {
                        events: {
                            click() {
                                const cat = this.options.custom.tag;
                                lockedCategory = lockedCategory === cat ? null : cat;
                                const bar = document.getElementById('eco-controls-bar');
                                if (bar) {
                                    bar.querySelectorAll('.eco-cat-pill').forEach(p => {
                                        const isAll = p.dataset.cat === '';
                                        p.classList.toggle('active', isAll ? !lockedCategory : lockedCategory === p.dataset.cat);
                                    });
                                }
                                applyFilterState(this.series.chart, true);
                            }
                        }
                    },
                    data: pieData
                }
            ],
            credits: { enabled: false }
        };

        Highcharts.chart('ecosystem-chart-container', chartConfig);

        let resizeTimeout;
        window.ecosystemResizeHandler = function () {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function () {
                if (window.ecosystemChart) {
                    window.ecosystemChart.reflow();
                    renderCustomLogos(window.ecosystemChart);
                }
            }, 250);
        };
        window.addEventListener('resize', window.ecosystemResizeHandler);
    } catch (error) {
        console.error('Error creating ecosystem chart:', error);
        document.getElementById('ecosystem-chart-container').innerHTML = '<div style="color: #ff6961; text-align: center; padding: 50px;">Error loading ecosystem data</div>';
    }
}
function main(ratio) {
    createHistoricalCharts(ratio);
    createDALSupportChart();
	createConsensusKeyAdoptionChart();
    createBurnedSupplyChart();
    createTotalAccountsChart();
    createTotalTransactionsChart();
    createTVLChart();
    createHistoricalTvlChart();
    createEcosystemChart();
    try {
        const {
            totalStakedPercentage,
            totalDelegatedPercentage,
            stakingApy,
            delegationApy
        } = aggregatedDataCache.homeData.stakingData;
        createPieChart(totalStakedPercentage, totalDelegatedPercentage, stakingApy.toFixed(2), delegationApy.toFixed(2));
    } catch (error) {
        console.error('Pie chart error:', error);
    }
    initializeStakingSimulator();
    if (aggregatedDataCache?.bakers)
        renderBakers(aggregatedDataCache.bakers);
}
const initTezCoolApp = async () => {
    try {
        new NavigationManager();
        const ratios = await initializeRatios();
        main(ratios);
        const tvlContainer = document.querySelector('#chart-container9')?.closest('.chart-with-controls');
        if (tvlContainer) {
            tvlContainer.querySelectorAll('.timeframe-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    tvlContainer.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentTVLTimeframe = this.dataset.timeframe;
                    createHistoricalTvlChart();
                });
            });
        }
        const burnedContainer = document.querySelector('#chart-container')?.closest('.chart-with-controls');
        if (burnedContainer) {
            burnedContainer.querySelectorAll('.timeframe-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    burnedContainer.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentBurnedSupplyTimeframe = this.dataset.timeframe;
                    createBurnedSupplyChart();
                });
            });
        }
    } catch (error) {
        console.error('Init error:', error);
    }
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
    }

    let scrollTimeout;
    window.addEventListener('scroll', () => {
        document.body.classList.add('is-scrolling');
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            document.body.classList.remove('is-scrolling');
        }, 150);
    }, { passive: true, capture: true });
};
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTezCoolApp);
} else {
    initTezCoolApp();
}
