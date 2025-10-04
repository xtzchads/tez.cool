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
                text: `Total: ${totalTVL.toLocaleString()}`,
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
        
        const timeframeButtons = document.querySelectorAll('.timeframe-btn');
        timeframeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                timeframeButtons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentTVLTimeframe = this.dataset.timeframe;
                createHistoricalTvlChart();
            });
        });
        
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});
















