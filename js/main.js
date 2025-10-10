const TRANSITION_PERIOD = 50;
const INITIAL_PERIOD = 10;
const AI_ACTIVATION_CYCLE = 748;
const LB_SUBSIDY = 2628000;
const WORKER_URL = 'https://tez.cool/api/v1/getData';
let aggregatedDataCache = null;
let currentCycle, forecasted, tmp = 0, tmp1;
let totalTVL;
let specificProtocolsTVL = 0;
let stakingSimulator;
let currentTVLTimeframe = '3y';
let currentBurnedSupplyTimeframe = 'cumulative';

function initializeStakingSimulator() {
    stakingSimulator = new StakingSimulator();
}

class StakingSimulator {
    constructor() {
        this.xtzInput = null;
        this.bakerFeeInput = null;
        this.daysSlider = null;
        this.daysDisplay = null;
        this.stakingApyDisplay = null;
        this.delegationApyDisplay = null;
        this.stakingRewardsDisplay = null;
        this.delegationRewardsDisplay = null;
        this.stakingTotalDisplay = null;
        this.delegationTotalDisplay = null;
        
        this.stakingAPY = 0;
        this.delegationAPY = 0;
        
        this.init();
    }
    
    init() {
        setTimeout(() => {
            this.bindElements();
            if (this.xtzInput && this.daysSlider && this.bakerFeeInput) {
                this.setupEventListeners();
                this.updateAPYValues();
                this.calculateRewards();
            }
        }, 100);
    }
    
    bindElements() {
        this.xtzInput = document.getElementById('xtz-amount');
        this.bakerFeeInput = document.getElementById('baker-fee');
        this.daysSlider = document.getElementById('days-slider');
        this.daysDisplay = document.getElementById('days-display');
        this.stakingApyDisplay = document.getElementById('staking-apy');
        this.delegationApyDisplay = document.getElementById('delegation-apy');
        this.stakingRewardsDisplay = document.getElementById('staking-rewards');
        this.delegationRewardsDisplay = document.getElementById('delegation-rewards');
        this.stakingTotalDisplay = document.getElementById('staking-total');
        this.delegationTotalDisplay = document.getElementById('delegation-total');
    }
    
setupEventListeners() {
    this.xtzInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
    let inputValue = e.target.value.replace(',', '.');
    let value = parseFloat(inputValue);
    
    if (isNaN(value) || value < 0) {
        e.target.value = '0';
    } else if (value > 1000000) {
        e.target.value = '1000000';
    } else if (inputValue.includes('.')) {
        const parts = inputValue.split('.');
        if (parts[1] && parts[1].length > 6) {
            e.target.value = parts[0] + '.' + parts[1].substring(0, 6);
        }
    }
    this.calculateRewards();
});

this.bakerFeeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
    let inputValue = e.target.value.replace(',', '.');
    let value = parseFloat(inputValue);
    
    if (isNaN(value) || value < 0) {
        e.target.value = '0';
    } else if (value > 100) {
        e.target.value = '100';
    } else if (inputValue.includes('.')) {
        const parts = inputValue.split('.');
        if (parts[1] && parts[1].length > 2) {
            e.target.value = parts[0] + '.' + parts[1].substring(0, 2);
        }
    }
    this.calculateRewards();
});
    
    this.daysSlider.addEventListener('input', () => {
        this.daysDisplay.textContent = this.daysSlider.value;
        this.calculateRewards();
    });
}
    
    updateAPYValues() {
        try {
            if (aggregatedDataCache && aggregatedDataCache.homeData && aggregatedDataCache.homeData.stakingData) {
                const stakingData = aggregatedDataCache.homeData.stakingData;
                this.stakingAPY = stakingData.stakingApy || 0;
                this.delegationAPY = stakingData.delegationApy || 0;
                
                if (this.stakingApyDisplay) {
                    this.stakingApyDisplay.textContent = `${this.stakingAPY.toFixed(2)}%`;
                }
                if (this.delegationApyDisplay) {
                    this.delegationApyDisplay.textContent = `${this.delegationAPY.toFixed(2)}%`;
                }
            }
        } catch (error) {
            console.error('Error updating APY values:', error);
            this.stakingAPY = 10;
            this.delegationAPY = 3.4;
            if (this.stakingApyDisplay) this.stakingApyDisplay.textContent = '10%';
            if (this.delegationApyDisplay) this.delegationApyDisplay.textContent = '3.4%';
        }
    }
    
    formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    }
    
    calculateCompoundRewards(principal, annualRate, days, bakerFeePercent = 0) {
    const netAnnualRate = (annualRate / 100) * (1 - bakerFeePercent / 100);
    const dailyCompoundRate = Math.pow(1 + netAnnualRate, 1/365) - 1;
    const finalAmount = principal * Math.pow(1 + dailyCompoundRate, days);
    
    return finalAmount - principal;
}
    
calculateRewards() {
    if (!this.xtzInput || !this.daysSlider || !this.bakerFeeInput) return;
    
    const principal = parseFloat(this.xtzInput.value) || 0;
    const days = parseInt(this.daysSlider.value) || 0;
    const bakerFee = parseFloat(this.bakerFeeInput.value) || 0;
    
    if (principal <= 0) {
        this.updateDisplays(0, 0, 0, 0);
        return;
    }
    const effectiveStakingAPY = this.stakingAPY * (1 - bakerFee / 100);
    const effectiveDelegationAPY = this.delegationAPY * (1 - bakerFee / 100);
    if (this.stakingApyDisplay) {
        this.stakingApyDisplay.textContent = `${effectiveStakingAPY.toFixed(2)}%`;
    }
    if (this.delegationApyDisplay) {
        this.delegationApyDisplay.textContent = `${effectiveDelegationAPY.toFixed(2)}%`;
    }
    const stakingRewards = this.calculateCompoundRewards(principal, this.stakingAPY, days, bakerFee);
    const delegationRewards = this.calculateCompoundRewards(principal, this.delegationAPY, days, bakerFee);
    
    const stakingTotal = principal + stakingRewards;
    const delegationTotal = principal + delegationRewards;
    
    this.updateDisplays(stakingRewards, stakingTotal, delegationRewards, delegationTotal);
}
    
    updateDisplays(stakingRewards, stakingTotal, delegationRewards, delegationTotal) {
        if (this.stakingRewardsDisplay) {
            this.stakingRewardsDisplay.textContent = `+${this.formatNumber(stakingRewards)} XTZ`;
        }
        if (this.stakingTotalDisplay) {
            this.stakingTotalDisplay.textContent = `${this.formatNumber(stakingTotal)} XTZ`;
        }
        if (this.delegationRewardsDisplay) {
            this.delegationRewardsDisplay.textContent = `+${this.formatNumber(delegationRewards)} XTZ`;
        }
        if (this.delegationTotalDisplay) {
            this.delegationTotalDisplay.textContent = `${this.formatNumber(delegationTotal)} XTZ`;
        }
    }
    
    refreshAPYValues() {
        this.updateAPYValues();
        this.calculateRewards();
    }
}

class NavigationManager {
    constructor() {
        this.navItems = document.querySelectorAll('.nav-item');
        this.homeContent = document.getElementById('home-content');
        this.iframeContainers = document.querySelectorAll('.iframe-container');
        this.preloadedIframes = new Set();
        this.currentView = 'home';
        this.savedScrollPosition = 0;
        
        this.init();
    }
    
    init() {
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const target = item.dataset.target;
                const url = item.dataset.url;
                const isExternal = item.dataset.external === 'true';
                
                if (isExternal && url) {
                    window.open(url, '_blank');
                    return;
                }
                
                if (target && target !== this.currentView) {
                    this.navigateTo(target, url, item);
                }
            });
        });
        
        window.addEventListener('resize', () => {
            if (this.currentView !== 'home') {
                this.adjustContainerHeight();
            }
        });
        
        setTimeout(() => {
            this.preloadIframes();
        }, 2000);
    }
    
    preloadIframes() {
        this.navItems.forEach(item => {
            const target = item.dataset.target;
            const url = item.dataset.url;
            const isExternal = item.dataset.external === 'true';
            
            if (url && target !== 'home' && !isExternal && !this.preloadedIframes.has(target)) {
                this.preloadIframe(target, url);
            }
        });
    }
    
    adjustContainerHeight() {
        const mainContainer = document.querySelector('.container.scrollable-content');
        if (!mainContainer) return;
        
        if (this.currentView === 'home') {
            mainContainer.style.height = 'auto';
            mainContainer.style.minHeight = '100vh';
            mainContainer.style.maxHeight = 'none';
            mainContainer.style.overflow = 'auto';

            mainContainer.scrollTop = this.savedScrollPosition;
        } else {
            const viewportHeight = window.innerHeight;
            const headerElement = document.querySelector('.header-content');
            const headerHeight = headerElement.offsetHeight;

            if (this.currentView === 'home') {
                this.savedScrollPosition = mainContainer.scrollTop;
            }
            
            mainContainer.scrollTop = 0;
            
            mainContainer.style.height = `${viewportHeight}px`;
            mainContainer.style.minHeight = `${viewportHeight}px`;
            mainContainer.style.maxHeight = `${viewportHeight}px`;
            mainContainer.style.overflow = 'hidden';
        }
    }
    
    preloadIframe(target, url) {
        const iframe = document.getElementById(`${target}-iframe`);
        if (iframe) {
            const navItem = document.querySelector(`[data-target="${target}"]`);
            
            iframe.onload = () => {
                this.preloadedIframes.add(target);
            };
            
            iframe.onerror = () => {
                console.warn(`Failed to preload: ${target}`);
            };
            
            iframe.src = url;
        }
    }
    
    navigateTo(target, url, clickedItem) {

        if (this.currentView === 'home' && target !== 'home') {
            const mainContainer = document.querySelector('.container.scrollable-content');
            if (mainContainer) {
                this.savedScrollPosition = mainContainer.scrollTop;
            }
        }
        
        this.navItems.forEach(item => item.classList.remove('active'));
        clickedItem.classList.add('active');
        
        if (target === 'home') {
            this.homeContent.classList.remove('hidden');
            this.iframeContainers.forEach(container => {
                container.classList.remove('active');
            });
        } else {
            this.homeContent.classList.add('hidden');
            this.iframeContainers.forEach(container => {
                container.classList.remove('active');
            });
            
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
        }
        
        this.currentView = target;
        setTimeout(() => {
            this.adjustContainerHeight();
        }, 100);
    }
}

function setupSmartTooltipPositioning() {
    const bakersGrid = document.getElementById('bakers-grid');
    if (!bakersGrid) return;
    
    const updateTooltipPositions = () => {
        const bakerItems = bakersGrid.querySelectorAll('.baker-item');
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const isMobile = viewportWidth <= 640;
        
        bakerItems.forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const tooltip = item.querySelector('.baker-tooltip');
            
            if (!tooltip) return;
            
            item.classList.remove('tooltip-left', 'tooltip-right', 'tooltip-top', 'tooltip-bottom');
            tooltip.style.minWidth = '';
            
            if (isMobile) {
                const spaceAbove = itemRect.top;
                const spaceBelow = viewportHeight - itemRect.bottom;
                const tooltipHeight = 150;
                
                if (spaceBelow >= tooltipHeight) {
                    item.classList.add('tooltip-bottom');
                    adjustTooltipWidthForVertical(item, tooltip, viewportWidth);
                } else if (spaceAbove >= tooltipHeight) {
                    item.classList.add('tooltip-top');
                    adjustTooltipWidthForVertical(item, tooltip, viewportWidth);
                } else {
                    const spaceOnRight = viewportWidth - itemRect.right;
                    const tooltipWidth = 240;
                    
                    if (spaceOnRight >= tooltipWidth) {
                        item.classList.add('tooltip-right');
                        adjustTooltipWidthForHorizontal(item, tooltip, viewportWidth, 'right');
                    } else {
                        item.classList.add('tooltip-left');
                        adjustTooltipWidthForHorizontal(item, tooltip, viewportWidth, 'left');
                    }
                }
            } else {
                const spaceOnRight = viewportWidth - itemRect.right;
                const tooltipWidth = 320;
                
                if (spaceOnRight >= tooltipWidth) {
                    item.classList.add('tooltip-right');
                    adjustTooltipWidthForHorizontal(item, tooltip, viewportWidth, 'right');
                } else {
                    item.classList.add('tooltip-left');
                    adjustTooltipWidthForHorizontal(item, tooltip, viewportWidth, 'left');
                }
            }
        });
    };
    
    function adjustTooltipWidthForHorizontal(item, tooltip, viewportWidth, position) {
        const itemRect = item.getBoundingClientRect();
        const tooltipGap = 12;
        const viewportPadding = 20;
        
        let availableWidth;
        
        if (position === 'right') {
            availableWidth = viewportWidth - itemRect.right - tooltipGap - viewportPadding;
        } else {
            availableWidth = itemRect.left - tooltipGap - viewportPadding;
        }
        const isMobile = viewportWidth <= 640;
        const defaultMinWidth = isMobile ? 200 : 280;
        if (availableWidth < defaultMinWidth) {
            const adjustedWidth = Math.max(180, availableWidth);
            tooltip.style.minWidth = adjustedWidth + 'px';
        }
    }
    
    function adjustTooltipWidthForVertical(item, tooltip, viewportWidth) {
        const itemRect = item.getBoundingClientRect();
        const viewportPadding = 20;
        
        const itemCenter = itemRect.left + (itemRect.width / 2);
        const maxWidthFromCenter = Math.min(
            itemCenter - viewportPadding,
            viewportWidth - itemCenter - viewportPadding 
        ) * 2;
        
        const defaultMinWidth = 250;
        if (maxWidthFromCenter < defaultMinWidth) {
            const adjustedWidth = Math.max(180, maxWidthFromCenter);
            tooltip.style.minWidth = adjustedWidth + 'px';
        }
    }
    updateTooltipPositions();
    window.addEventListener('resize', updateTooltipPositions);
    const observer = new MutationObserver(updateTooltipPositions);
    observer.observe(bakersGrid, { childList: true });
}

function renderBakers(bakers) {
    const bakersGrid = document.getElementById('bakers-grid');
    
    bakersGrid.innerHTML = '';
    
    const sortedBakers = bakers
        .filter(baker => baker.status === 'active')
        .filter(baker => baker.staking && baker.staking.enabled)
        .sort((a, b) => {
            const aEstimatedApy = a.staking.estimatedApy || 0;
            const bEstimatedApy = b.staking.estimatedApy || 0;
            return bEstimatedApy - aEstimatedApy;
        })
        .slice(0, 100);
    
    sortedBakers.forEach(baker => {
        const bakerElement = createBakerElement(baker);
        if (bakerElement) { 
            bakersGrid.appendChild(bakerElement);
        }
    });
    
    setTimeout(() => {
        setupSmartTooltipPositioning();
    }, 100);
}

function createBakerElement(baker) {
    const div = document.createElement('div');
    div.className = 'baker-item';
    const stakingData = baker.staking || {};
    
    const apy = stakingData.estimatedApy || 0;
    const fee = stakingData.fee || 0;
    const capacity = stakingData.capacity || 0;
    const freeSpace = stakingData.freeSpace || 0;
    const usedCapacity = capacity - freeSpace;
    const capacityPercent = capacity > 0 ? (usedCapacity / capacity) * 100 : 0;
    
    div.innerHTML = `
        <div class="baker-avatar">
            <img 
                src="https://services.tzkt.io/v1/avatars/${escapeHTML(baker.address)}" 
                alt="${escapeHTML(baker.name)}"
                onerror="this.style.display='none'" onclick="window.open('https://tzkt.io/${escapeHTML(baker.address)}', '_blank')"
            />
        </div>
        <div class="baker-tooltip">
            <div class="baker-name">${escapeHTML(baker.name) || 'Unknown Baker'}</div>
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
                    <span class="baker-info-value">${formatNumber(capacity)} XTZ</span>
                </div>
                <div style="margin-top: 8px;">
                    <div class="capacity-bar">
                        <div class="capacity-fill" style="width: ${Math.min(capacityPercent, 100)}%"></div>
                    </div>
                    <div class="capacity-text">${capacityPercent.toFixed(1)}% filled</div>
                </div>
                <div class="baker-info-row" style="margin-top: 4px;">
                    <span class="baker-info-label">Available:</span>
                    <span class="baker-info-value">${formatNumber(freeSpace)} XTZ</span>
                </div>
            </div>
        </div>
    `;
    
    return div;
}

function escapeHTML(str) {
    return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
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
                        brightness: 0.1
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
                            [0, 'hsla(220, 85%, 70%, 0.9)'],
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
                            [0, 'hsla(280, 85%, 70%, 0.9)'],
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
                            [0, 'hsla(10, 85%, 70%, 0.9)'],
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
                    textOutline: '1px contrast'
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
                lineWidth: 2,
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
                    const diff = sortedData[i][1] - sortedData[i-1][1];
                    processedData.push([sortedData[i][0], diff]);
                }
                processedData.reverse();
            }
        }
        
        const formatter = isCumulative 
            ? value => `${(value / 1000000).toFixed(2)}M`
            : value => `${(value / 1000).toFixed(2)}K`;
        
        createTimeSeriesChart(
            'chart-container', 
            'Burned Supply', 
            processedData, 
            formatter,
            isCumulative
        );
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
        
        let rawData = aggregatedDataCache.combinedTvlChart
            .filter(item => item[0] > filterTimestamp)
            .map(item => [item[0] / 1000, item[1]])
            .sort((a, b) => a[0] - b[0]);
        
        const tezosData = recursivelyRemoveDips(rawData, 0.2);
        
        if (tezosData.length > 0) {
            tezosData[tezosData.length - 1][1] = totalTVL - specificProtocolsTVL;
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
			tooltip: {
        outside: true,
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
                    connectNulls: false,
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
                yAxis: 0
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
tooltip: {
    outside: true,
    style: {
        fontFamily: '"Monda", Helvetica, Arial, sans-serif'
    },
    valueDecimals: 0,
	valueSuffix: ' XTZ',
	xDateFormat: '%b %Y'
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
                cycle: currentCycle + index + 1,
                issuance: issuanceRateQ(index + currentCycle, ratioValue)+0.245
            }))
        ];
        
        createHistoricalChart('issuanceh', 'Issuance since genesis', issuanceDataWithRatio, d => ({
            x: d.cycle,
            y: d.issuance
        }), [428, 743, 823, currentCycle]);
        
        const stakingDataWithRatio = [
            ...stakingData.ratios, 
            ...ratio.map((ratioValue, index) => ({
                cycle: currentCycle + index + 1, 
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
            max: containerId === 'issuanceh' ? 11 : 50,
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
            lineWidth: 2,
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
                    y: issuanceRateQ(point.x, stakingPoint.y / 100)+0.245
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
                name: `${project}`,
                y: tvlValues[index],
                color: {
                    radialGradient: {
                        cx: 0.5,
                        cy: 0.5,
                        r: 0.8
                    },
                    stops: [
                        [0, `hsla(${hue}, ${saturation}%, ${lightness + 15}%, 0.9)`],
                        [0.5, `hsla(${hue}, ${saturation - 10}%, ${lightness}%, 0.8)`],
                        [1, `hsla(${hue}, ${saturation - 20}%, ${lightness - 15}%, 0.7)`]
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
                text: 'DeFi NET TVL (+RWA)',
                style: { color: '#ffffff', fontSize: '24px' }
            },
            subtitle: {
                text: `Total: $${totalTVL.toLocaleString()}`,
                style: { color: '#22c55e', fontSize: '16px' }
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
            }],
            exporting: { enabled: false },
            credits: { enabled: false }
        });
    } catch (error) {
        console.error('Error creating TVL chart:', error);
    }
}

async function createEcosystemChart() {
    try {
        const projects = aggregatedDataCache.ecosystemProjects;
        
        if (!projects || projects.length === 0) {
            console.error('No ecosystem projects data available');
            document.getElementById('ecosystem-chart-container').innerHTML = 
                '<div style="color: #ff6961; text-align: center; padding: 50px;">No ecosystem data available</div>';
            return;
        }
		
		const allProjects = [...projects];
        
        const tagMapping = {
            'defi': 'defi',
            'etherlink': 'defi',
            'stablecoins': 'defi',
			'rwa': 'defi',
			'did': 'community',
            'devtools': 'tooling',
            'baking': 'tooling',
            'blockexplorers': 'tooling',
            'education': 'tooling'
        };
        
        const tagColors = {
            'defi': '#6CDDCA',
            'gaming': '#C771F3',
            'nft': '#4D90DB',
            'community': '#FAB776',
            'tooling': '#FF6B9D',
            'did': '#F38181',
            'rwa': '#FFAAA7'
        };
        
        const tagDisplayNames = {
            'defi': 'DeFi',
            'gaming': 'Gaming',
            'nft': 'NFT',
            'community': 'Community',
            'tooling': 'Tooling & Infra',
            'did': 'DID',
            'rwa': 'RWA'
        };

        const projectsByTag = {};
        const processedProjects = new Set();
        
        allProjects.forEach(project => {
            if (project.fields.Tags && project.fields.Tags.length > 0 && project.fields.Status === 'active') {
                if (processedProjects.has(project.fields.Project)) {
                    return;
                }
                
                let mainTag = null;
                
                for (const tag of project.fields.Tags) {
                    if (tag === 'partner') continue;
                    
                    mainTag = tagMapping[tag] || tag;
                    break;
                }
                
                if (mainTag) {
                    if (!projectsByTag[mainTag]) {
                        projectsByTag[mainTag] = [];
                    }
                    projectsByTag[mainTag].push(project);
                    processedProjects.add(project.fields.Project);
                }
                
        }});
        
        const bubbleData = [];
        const tags = Object.keys(projectsByTag);
        const totalAngle = 360;
        const anglePerTag = totalAngle / tags.length;
        
        tags.forEach((tag, tagIndex) => {
            const tagProjects = projectsByTag[tag];
            const sectionStartAngle = tagIndex * anglePerTag;
            const centerAngle = sectionStartAngle + anglePerTag / 2;
            
            function getItemsPerRow(rowNum) {
                const rowRadius = 20 + (rowNum * 10);
                const circumference = 2 * Math.PI * rowRadius;
                const sectionCircumference = (circumference * anglePerTag) / 360;
                const itemSpacing = 9;
                return Math.max(2, Math.min(6, Math.floor(sectionCircumference / itemSpacing)));
            }
            
            tagProjects.forEach((project, projectIndex) => {
                let row = 0;
                let itemsPlaced = 0;
                let currentRow = 0;
                
                while (itemsPlaced + getItemsPerRow(currentRow) <= projectIndex) {
                    itemsPlaced += getItemsPerRow(currentRow);
                    currentRow++;
                }
                
                row = currentRow;
                const col = projectIndex - itemsPlaced;
                const itemsInThisRow = getItemsPerRow(row);
                
                const radius = 20 + (row * 10);
                
                const angleStep = anglePerTag / (itemsInThisRow + 1);
                const angle = sectionStartAngle + angleStep * (col + 1);
                
                let bubbleSize = window.innerWidth < 480 ? 20 : (window.innerWidth < 768 ? 28 : 35);
                
                let logoUrl = null;
                if (project.fields.Logo && project.fields.Logo.length > 0) {
					const url = project.fields.Logo[0].url;
                    logoUrl = url.startsWith('http://')||url.startsWith('https://')?url:window.location.origin+url;
                }
                
                bubbleData.push({
                    name: project.fields.Project,
                    x: angle,
                    y: radius,
                    z: bubbleSize,
                    color: tagColors[tag] || '#999999',
                    custom: {
                        tag: tag,
                        displayTag: tagDisplayNames[tag] || tag,
                        logline: project.fields.Logline || '',
                        website: project.fields.Website || '',
                        tags: project.fields.Tags || [],
                        featured: project.fields.IsFeatured || false,
                        logoUrl: logoUrl
                    }
                });
            });
        });
        
        const pieData = tags.map((tag, index) => ({
            y: 1,
            color: tagColors[tag] || '#999999',
            name: tagDisplayNames[tag] || tag,
            custom: {
                tag: tag,
                displayTag: tagDisplayNames[tag] || tag,
                count: projectsByTag[tag].length
            }
        }));
		

        function renderCustomLogos(chart) {
            const bubbleSeries = chart.series[0];
            
            if (chart.customLogoGroups) {
                chart.customLogoGroups.forEach(group => group.destroy());
            }
            chart.customLogoGroups = [];
            
            if (chart.customClipPaths) {
                chart.customClipPaths.forEach(clip => clip.destroy());
            }
            chart.customClipPaths = [];
            
            bubbleSeries.points.forEach((point) => {
                if (point.custom && point.custom.logoUrl && point.graphic) {
                    const logoUrl = point.custom.logoUrl;
                    const circleSize = point.marker.radius * 2;
                    
                    const plotX = point.plotX + chart.plotLeft;
                    const plotY = point.plotY + chart.plotTop;
                    
                    const group = chart.renderer.g().attr({
                        zIndex: 5,
                        'class': 'clickable-logo'
                    }).css({
                        cursor: 'pointer'
                    }).add();
                    
                    chart.customLogoGroups.push(group);
                    
                    group.element.addEventListener('click', function() {
                        if (point.custom && point.custom.website) {
                            window.open(point.custom.website, '_blank');
                        }
                    });
                    
                    group.element.addEventListener('mouseenter', function(e) {
                        if (point.customBorderCircle) {
                            point.customBorderCircle.attr({ opacity: 1 });
                        }
                        
                        const customTooltip = document.getElementById('custom-tooltip');
                        const logoHtml = point.custom.logoUrl ? 
                            `<img src="${point.custom.logoUrl}" style="width: 32px; height: 32px; border-radius: 8px; margin-bottom: 8px; background: white; padding: 2px;" />` : '';
                        customTooltip.innerHTML = `
                            ${logoHtml}
                            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">
                                ${point.name}
                            </div>
                            <div style="color: rgba(255, 255, 255, 0.7); font-size: 12px; margin-bottom: 4px;">
                                ${point.custom.logline}
                            </div>
                            <div style="color: ${point.color}; font-size: 11px; text-transform: uppercase;">
                                ${point.custom.displayTag}
                            </div>
                        `;
                        customTooltip.style.display = 'block';
                    });
                    
                    group.element.addEventListener('mousemove', function(e) {
                        const customTooltip = document.getElementById('custom-tooltip');
                        const container = document.getElementById('ecosystem-chart-container');
                        const rect = container.getBoundingClientRect();
                        
                        let left = e.clientX - rect.left + 10;
                        let top = e.clientY - rect.top + 10;
                        
                        const tooltipWidth = customTooltip.offsetWidth;
                        const tooltipHeight = customTooltip.offsetHeight;
                        
                        if (left + tooltipWidth > rect.width) {
                            left = e.clientX - rect.left - tooltipWidth - 10;
                        }
                        
                        if (top + tooltipHeight > rect.height) {
                            top = e.clientY - rect.top - tooltipHeight - 10;
                        }
                        
                        if (left < 0) {
                            left = 10;
                        }
                        
                        if (top < 0) {
                            top = 10;
                        }
                        
                        customTooltip.style.left = left + 'px';
                        customTooltip.style.top = top + 'px';
                    });
                    
                    group.element.addEventListener('mouseleave', function() {
                        if (point.customBorderCircle) {
                            point.customBorderCircle.attr({ opacity: 0 });
                        }
                        
                        const customTooltip = document.getElementById('custom-tooltip');
                        customTooltip.style.display = 'none';
                    });
                    
                    point.customImageGroup = group;

                    const clipId = 'clip-' + point.index + '-' + Date.now();
                    const clipPath = chart.renderer.createElement('clipPath').attr({
                        id: clipId
                    }).add(chart.renderer.defs);
                    
                    chart.customClipPaths.push(clipPath);

                    chart.renderer.circle(0, 0, circleSize / 2).add(clipPath);

                    const bgCircle = chart.renderer.circle(
                        plotX,
                        plotY,
                        circleSize / 2
                    ).attr({
                        fill: 'white'
                    }).add(group);
                    
                    const imgGroup = chart.renderer.g().attr({
                        'clip-path': `url(#${clipId})`,
                        transform: `translate(${plotX}, ${plotY})`
                    }).add(group);
                    
                    const imgSize = circleSize;
                    chart.renderer.image(
                        logoUrl,
                        -imgSize / 2,
                        -imgSize / 2,
                        imgSize,
                        imgSize
                    ).attr({
                        preserveAspectRatio: 'xMidYMid slice'
                    }).add(imgGroup);
                    
                    const borderCircle = chart.renderer.circle(
                        plotX,
                        plotY,
                        circleSize / 2
                    ).attr({
                        fill: 'none',
                        stroke: 'rgba(255, 255, 255, 0.3)',
                        'stroke-width': 2,
                        opacity: 0
                    }).add(group);
                    
                    point.customBorderCircle = borderCircle;
                    
                    if (point.graphic) {
                        point.graphic.attr({ opacity: 0 });
                    }
                }
            });
        }

        function fillCenter(count, label, chart, customLabel) {
const countSize = window.innerWidth < 480 ? '20px' : (window.innerWidth < 768 ? '28px' : '48px');
const labelSize = window.innerWidth < 480 ? '5px' : (window.innerWidth < 768 ? '10px' : '14px');
            
            const labelText = `
                <div style="text-align: center; pointer-events: none;">
                    <div style="font-size: ${countSize}; font-weight: 600; color: #ffffff; line-height: 1;">
                        ${count}
                    </div>
                    <div style="font-size: ${labelSize}; color: rgba(255, 255, 255, 0.7); margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">
                        ${label}
                    </div>
                </div>
            `;

            if (!customLabel) {
                customLabel = chart.renderer.label(
                    labelText, 0, 0, undefined, undefined, undefined, true
                ).css({
                    color: '#ffffff',
                    pointerEvents: 'none'
                }).attr({
                    zIndex: 0
                }).add();
            } else {
                customLabel.attr({ text: labelText });
            }

            customLabel.attr({
                x: (chart.pane[0].center[0] + chart.plotLeft) - customLabel.attr('width') / 2,
                y: (chart.pane[0].center[1] + chart.plotTop) - customLabel.attr('height') / 2,
                zIndex: 0
            });

            return customLabel;
        }

        const chartConfig = {
            chart: {
                type: 'bubble',
                polar: true,
                height: window.innerWidth < 768 ? 500 : 800,
                backgroundColor: 'rgba(0,0,0,0)',
                events: {
                    load() {
                        const chart = this;
                        
                        const container = document.getElementById('ecosystem-chart-container');
                        container.style.position = 'relative';
                        
                        const customTooltip = document.createElement('div');
                        customTooltip.id = 'custom-tooltip';
                        customTooltip.style.cssText = `
                            position: absolute;
                            display: none;
                            background: rgba(15, 10, 35, 0.95);
                            border: 1px solid rgba(255, 255, 255, 0.26);
                            border-radius: 16px;
                            padding: 8px;
                            color: white;
                            font-family: "Monda", Helvetica;
                            z-index: 10000;
                            pointer-events: none;
                            max-width: 250px;
                        `;
                        container.appendChild(customTooltip);
                        
                        window.ecosystemChart = chart;
                        
                        renderCustomLogos(chart);
                    },
                    redraw() {
                        renderCustomLogos(this);
                    },
                    render() {
                        const chart = this;
                        const pieSeries = chart.series[1];
                        
                        if (pieSeries) {
                            pieSeries.customLabel = fillCenter(
                                processedProjects.size,
                                'TOTAL PROJECTS',
                                chart,
                                pieSeries.customLabel
                            );
                        }
                    }
                }
            },
            title: {
                text: 'Tezos Ecosystem Map',
                style: { 
                    color: '#ffffff',
                    fontSize: window.innerWidth < 768 ? '20px' : '28px',
                    fontFamily: '"Monda", Helvetica'
                }
            },
            subtitle: {
                text: window.innerWidth < 768 ? 'Click to visit websites' : 'Active projects organized by category • Click to visit websites',
                style: { 
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontFamily: '"Monda", Helvetica',
                    fontSize: window.innerWidth < 768 ? '11px' : '12px'
                }
            },
            legend: {
                enabled: false
            },
            pane: {
                startAngle: 0,
                innerSize: window.innerWidth < 768 ? '35%' : '30%',
                size: window.innerWidth < 480 ? '100%' : '95%',
                background: [{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                }, {
                    backgroundColor: 'rgba(255, 255, 255, 0.01)',
                    borderWidth: 0,
                    outerRadius: window.innerWidth < 768 ? '35%' : '30%'
                }]
            },
            xAxis: {
                tickPositions: Array.from({length: tags.length + 1}, (_, i) => i * anglePerTag),
                min: 0,
                max: totalAngle,
                gridLineWidth: 1,
                gridLineColor: 'rgba(255, 255, 255, 0.2)',
                labels: {
                    enabled: false
                },
                lineWidth: 0,
				
            },
            yAxis: {
                tickInterval: 10,
                labels: {
                    enabled: false
                },
                gridLineWidth: 0.5,
                gridLineColor: 'rgba(255, 255, 255, 0.08)',
                gridLineDashStyle: 'longdash',
                endOnTick: false,
                min: 15,
                max: 70
            },
            tooltip: {
                enabled: false
            },
            plotOptions: {
                series: {
                    cursor: 'pointer',
                    point: {
                        events: {
                            click: function() {
                                if (this.custom && this.custom.website) {
                                    window.open(this.custom.website, '_blank');
                                }
                            },
                            mouseOver: function() {
                                if (this.customBorderCircle) {
                                    this.customBorderCircle.attr({ opacity: 1 });
                                }
                            },
                            mouseOut: function() {
                                if (this.customBorderCircle) {
                                    this.customBorderCircle.attr({ opacity: 0 });
                                }
                            }
                        }
                    },
                    states: {
                        inactive: { enabled: false },
                        hover: {
                            halo: false
                        }
                    }
                },
                bubble: {
    minSize: window.innerWidth < 480 ? 6 : 
             window.innerWidth < 640 ? 8 : 
             window.innerWidth < 768 ? 10 : 
             window.innerWidth < 1024 ? 12 : 14,
    maxSize: window.innerWidth < 480 ? 12 : 
             window.innerWidth < 640 ? 16 : 
             window.innerWidth < 768 ? 20 : 
             window.innerWidth < 1024 ? 25 : 30
},
                pie: {
                    startAngle: 0,
                    states: {
                        hover: { halo: 0 }
                    }
                }
            },
            series: [{
                name: 'Projects',
                data: bubbleData,
                point: {
                    events: {
                        mouseOver() {
                            const selectedTag = this.custom.tag;
                            const chart = this.series.chart;
                            const bubbleSeries = chart.series[0];
                            const pieSeries = chart.series[1];

                            bubbleSeries.points.forEach(point => {
                                if (point.custom.tag !== selectedTag) {
                                    if (point.graphic) point.graphic.attr({ opacity: 0.2 });
                                    if (point.customImageGroup) point.customImageGroup.attr({ opacity: 0.2 });
                                }
                            });

                            const matchingCount = bubbleSeries.points.filter(p => p.custom.tag === selectedTag).length;
                            pieSeries.customLabel = fillCenter(
                                matchingCount,
                                this.custom.displayTag.toUpperCase(),
                                chart,
                                pieSeries.customLabel
                            );
                        },
                        mouseOut() {
                            const chart = this.series.chart;
                            const bubbleSeries = chart.series[0];
                            const pieSeries = chart.series[1];

                            bubbleSeries.points.forEach(point => {
                                if (point.graphic) point.graphic.attr({ opacity: 1 });
                                if (point.customImageGroup) point.customImageGroup.attr({ opacity: 1 });
                            });

                            pieSeries.customLabel = fillCenter(
                                processedProjects.size,
                                'TOTAL PROJECTS',
                                chart,
                                pieSeries.customLabel
                            );
                        }
                    }
                }
            }, {
                type: 'pie',
                dataLabels: {
                    enabled: false
                },
                size: '28%',
                innerSize: '85%',
                zIndex: -1,
                point: {
                    events: {
                        mouseOver() {
                            const selectedTag = this.options.custom.tag;
                            const chart = this.series.chart;
                            const bubbleSeries = chart.series[0];
                            const series = this.series;

                            bubbleSeries.points.forEach(point => {
                                if (point.custom.tag !== selectedTag) {
                                    if (point.graphic) point.graphic.attr({ opacity: 0.2 });
                                    if (point.customImageGroup) point.customImageGroup.attr({ opacity: 0.2 });
                                }
                            });

                            series.customLabel = fillCenter(
                                this.options.custom.count,
                                this.options.custom.displayTag.toUpperCase(),
                                chart,
                                series.customLabel
                            );
                        },
                        mouseOut() {
                            const chart = this.series.chart;
                            const bubbleSeries = chart.series[0];
                            const series = this.series;

                            bubbleSeries.points.forEach(point => {
                                if (point.graphic) point.graphic.attr({ opacity: 1 });
                                if (point.customImageGroup) point.customImageGroup.attr({ opacity: 1 });
                            });

                            series.customLabel = fillCenter(
                                processedProjects.size,
                                'TOTAL PROJECTS',
                                chart,
                                series.customLabel
                            );
                        }
                    }
                },
                data: pieData
            }],
            credits: { enabled: false }
        };
        
        const chart = Highcharts.chart('ecosystem-chart-container', chartConfig);
        
        let resizeTimeout;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                if (window.ecosystemChart) {
                    createEcosystemChart();
                }
            }, 250);
        });

    } catch (error) {
        console.error('Error creating ecosystem chart:', error);
        document.getElementById('ecosystem-chart-container').innerHTML = 
            '<div style="color: #ff6961; text-align: center; padding: 50px;">Error loading ecosystem data</div>';
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
    createEcosystemChart();
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
        initializeStakingSimulator();

    if (aggregatedDataCache && aggregatedDataCache.bakers) {
        renderBakers(aggregatedDataCache.bakers);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
	
    try {
        new NavigationManager();

        const ratios = await initializeRatios();
        main(ratios);
        
        const tvlContainer = document.querySelector('#chart-container9').closest('.chart-with-controls');
        if (tvlContainer) {
            const tvlButtons = tvlContainer.querySelectorAll('.timeframe-btn');
            tvlButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    tvlButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentTVLTimeframe = this.dataset.timeframe;
                    createHistoricalTvlChart();
                });
            });
        }
        
const burnedSupplyContainer = document.querySelector('#chart-container').closest('.chart-with-controls');
if (burnedSupplyContainer) {
    const burnedSupplyButtons = burnedSupplyContainer.querySelectorAll('.timeframe-btn');
    const burnedButtonsContainer = burnedSupplyContainer.querySelector('.chart-timeframe-buttons');

    
    burnedSupplyButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            burnedSupplyButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentBurnedSupplyTimeframe = this.dataset.timeframe;
            createBurnedSupplyChart();
        });
    });
    
}
        
    } catch (error) {
        console.error('Error during initialization:', error);
    }
	const overlay = document.getElementById('loadingOverlay');
	overlay.style.opacity = '0';
	overlay.style.pointerEvents = 'none';
});





