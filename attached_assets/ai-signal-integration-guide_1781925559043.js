/**
 * INTEGRATING AI SIGNAL GENERATOR INTO YOUR GOLD SCALPING APP
 * Complete implementation guide with examples
 */

// ============================================================
// STEP 1: INITIALIZE AI SIGNAL GENERATOR IN YOUR APP
// ============================================================

// In your main app.js file:

let aiSignalGenerator = null;

// Initialize AI when app loads
function initializeAISignalGenerator() {
  aiSignalGenerator = new AISignalGenerator();
  console.log('[APP] AI Signal Generator initialized');
}

// Call this on app start
document.addEventListener('DOMContentLoaded', () => {
  initializeAISignalGenerator();
});


// ============================================================
// STEP 2: COLLECT MARKET DATA FOR AI ANALYSIS
// ============================================================

function collectMarketData(candles, indicators, newsAnalysis, technicalSignal) {
  return {
    // Current Price Data
    currentPrice: candles[candles.length - 2]?.close || 0,
    open: candles[candles.length - 2]?.open || 0,
    high: candles[candles.length - 2]?.high || 0,
    low: candles[candles.length - 2]?.low || 0,
    close: candles[candles.length - 2]?.close || 0,

    // Technical Indicators
    ema9: indicators?.ema9 || 0,
    ema21: indicators?.ema21 || 0,
    rsi14: indicators?.rsi14 || 0,
    macd: indicators?.macd || { value: 0, signal: 0, histogram: 0 },
    atr: indicators?.atr || 0,
    adx: indicators?.adx || 0,

    // Support & Resistance
    support1: technicalSignal?.support1 || 0,
    support2: technicalSignal?.support2 || 0,
    resistance1: technicalSignal?.resistance1 || 0,
    resistance2: technicalSignal?.resistance2 || 0,

    // Order Blocks & Patterns
    orderBlocks: technicalSignal?.orderBlocks || [],
    fvgZones: technicalSignal?.fvgZones || [],
    liquiditySweeps: technicalSignal?.liquiditySweeps || [],

    // News & Fundamentals
    newsBias: newsAnalysis?.bias || 0,
    fedPolicy: newsAnalysis?.fedPolicy?.outlook || 'neutral',
    realRates: newsAnalysis?.realInterestRate?.realRate || 0,
    dollarIndex: newsAnalysis?.dollarStrength?.dxyIndex || 0,
    geopoliticalRisk: newsAnalysis?.geopoliticalRisk || 'neutral',

    // Session & Time
    session: getCurrentSession(),
    timestamp: new Date().toISOString(),

    // Recent Trade History (for context)
    lastSignal: getLastSignal(),
    consecutiveWins: getConsecutiveWins(),
    consecutiveLosses: getConsecutiveLosses()
  };
}


// ============================================================
// STEP 3: CALL AI SIGNAL GENERATOR
// ============================================================

async function generateSignalWithAI(candles, indicators, newsAnalysis, technicalSignal) {
  try {
    // Collect all market data
    const marketData = collectMarketData(candles, indicators, newsAnalysis, technicalSignal);

    console.log('[MAIN] Generating AI signal...');
    console.log('[MARKET DATA] Collected:', marketData);

    // Call AI signal generator
    const aiSignal = await aiSignalGenerator.generateAISignal(marketData);

    if (!aiSignal) {
      console.log('[AI] No signal generated - waiting for better setup');
      return null;
    }

    // Display AI signal on dashboard
    displayAISignal(aiSignal);

    // Log for analysis
    console.log(`[SIGNAL] AI Generated: ${aiSignal.direction} @ ${aiSignal.adjustedConfidence}%`);

    return aiSignal;

  } catch (error) {
    console.error('[GENERATE SIGNAL] Error:', error);
    return null;
  }
}


// ============================================================
// STEP 4: DISPLAY AI SIGNAL ON DASHBOARD
// ============================================================

function displayAISignal(signal) {
  if (!signal) return;

  // Update signal status
  const signalElement = document.getElementById('signal-status');
  if (signalElement) {
    signalElement.innerHTML = `
      <div class="ai-signal-box" style="background: ${signal.direction === 'BUY' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'}; border: 2px solid ${signal.direction === 'BUY' ? '#4CAF50' : '#F44336'}; padding: 15px; border-radius: 8px; margin: 10px 0;">
        
        <div style="font-size: 24px; font-weight: bold; color: ${signal.direction === 'BUY' ? '#4CAF50' : '#F44336'};">
          🤖 AI: ${signal.direction} SIGNAL
        </div>

        <div style="font-size: 14px; color: #FFA; margin: 10px 0;">
          Signal ID: ${signal.signalId}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
          <div>
            <div style="color: #888; font-size: 12px;">CONFIDENCE</div>
            <div style="color: #4CAF50; font-size: 20px; font-weight: bold;">${signal.adjustedConfidence}%</div>
          </div>
          <div>
            <div style="color: #888; font-size: 12px;">RISK:REWARD</div>
            <div style="color: #FFD700; font-size: 20px; font-weight: bold;">1:${signal.riskRewardRatio.toFixed(2)}</div>
          </div>
        </div>

        <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; margin: 10px 0;">
          <div style="color: #FFD700; font-weight: bold; margin-bottom: 8px;">TRADE DETAILS:</div>
          <div style="font-size: 13px; color: #CCC; line-height: 1.6;">
            Entry: <span style="color: #4CAF50; font-weight: bold;">$${signal.entry.toFixed(2)}</span><br>
            Stop Loss: <span style="color: #F44336; font-weight: bold;">$${signal.stopLoss.toFixed(2)}</span> (${signal.slDistance.toFixed(2)} pts)<br>
            Take Profit: <span style="color: #4CAF50; font-weight: bold;">$${signal.takeProfit.toFixed(2)}</span> (${signal.tpDistance.toFixed(2)} pts)
          </div>
        </div>

        <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; margin: 10px 0;">
          <div style="color: #FFD700; font-weight: bold; margin-bottom: 8px;">AI ANALYSIS:</div>
          <div style="font-size: 12px; color: #CCC; line-height: 1.8;">
            <div>📈 Trend: ${signal.analysis.trend}</div>
            <div>💨 Momentum: ${signal.analysis.momentum}</div>
            <div>📍 Support/Resistance: ${signal.analysis.supportResistance}</div>
            <div>🔹 Patterns: ${signal.analysis.patterns}</div>
            <div>📰 Fundamentals: ${signal.analysis.fundamentals}</div>
          </div>
        </div>

        <div style="background: rgba(76, 175, 80, 0.1); padding: 10px; border-left: 3px solid #4CAF50; border-radius: 3px; margin: 10px 0;">
          <div style="color: #4CAF50; font-weight: bold; margin-bottom: 5px;">✅ KEY REASONS:</div>
          ${signal.reasons.map(r => `<div style="font-size: 12px; color: #CCC; margin: 3px 0;">• ${r}</div>`).join('')}
        </div>

        <div style="background: rgba(244, 67, 54, 0.1); padding: 10px; border-left: 3px solid #F44336; border-radius: 3px; margin: 10px 0;">
          <div style="color: #F44336; font-weight: bold; margin-bottom: 5px;">⚠️ RISKS:</div>
          ${signal.risks.map(r => `<div style="font-size: 12px; color: #CCC; margin: 3px 0;">• ${r}</div>`).join('')}
        </div>

        <div style="background: rgba(255, 193, 7, 0.1); padding: 10px; border-left: 3px solid #FFC107; border-radius: 3px; margin: 10px 0;">
          <div style="color: #FFC107; font-weight: bold; margin-bottom: 5px;">📋 NEXT TRIGGER:</div>
          <div style="font-size: 12px; color: #CCC;">${signal.nextTrigger}</div>
        </div>

        <div style="margin-top: 15px; text-align: center;">
          <button onclick="acceptAISignal('${signal.signalId}')" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; margin-right: 10px;">
            ✅ Accept Signal
          </button>
          <button onclick="rejectAISignal('${signal.signalId}')" style="background: #F44336; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">
            ❌ Reject Signal
          </button>
        </div>
      </div>
    `;
  }
}


// ============================================================
// STEP 5: HANDLE SIGNAL ACCEPTANCE/REJECTION
// ============================================================

function acceptAISignal(signalId) {
  console.log(`[USER] Accepted AI signal ${signalId}`);
  
  const signal = aiSignalGenerator.analysisHistory.find(s => s.signalId === signalId);
  if (signal) {
    // Place trade
    console.log(`[TRADE] Entering ${signal.direction} at $${signal.entry.toFixed(2)}`);
    console.log(`[TRADE] SL: $${signal.stopLoss.toFixed(2)}, TP: $${signal.takeProfit.toFixed(2)}`);
    
    // Update UI to show active trade
    displayActiveTrade(signal);
  }
}

function rejectAISignal(signalId) {
  console.log(`[USER] Rejected AI signal ${signalId}`);
  const signal = aiSignalGenerator.analysisHistory.find(s => s.signalId === signalId);
  if (signal) {
    signal.rejected = true;
    console.log('[USER] Signal rejected - waiting for next setup');
  }
}


// ============================================================
// STEP 6: TRACK SIGNAL RESULTS
// ============================================================

function recordSignalResult(signalId, profitLoss, result) {
  aiSignalGenerator.trackSignalResult(signalId, result); // 'WIN' or 'LOSS'
  
  console.log(`[RESULT] Signal ${signalId}: ${result} (P&L: ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)} pts)`);
  
  // Update stats
  updateAIStatistics();
}

function updateAIStatistics() {
  const data = aiSignalGenerator.exportForDashboard();
  
  const statsElement = document.getElementById('ai-stats');
  if (statsElement) {
    statsElement.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 10px 0;">
        <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
          <div style="color: #888; font-size: 11px;">TOTAL SIGNALS</div>
          <div style="color: #4CAF50; font-size: 18px; font-weight: bold;">${data.totalSignals}</div>
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
          <div style="color: #888; font-size: 11px;">WIN RATE</div>
          <div style="color: #FFD700; font-size: 18px; font-weight: bold;">${data.winRate}%</div>
        </div>
        <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
          <div style="color: #888; font-size: 11px;">AVG CONFIDENCE</div>
          <div style="color: #4CAF50; font-size: 18px; font-weight: bold;">${data.avgConfidence}%</div>
        </div>
      </div>

      <div style="margin-top: 15px;">
        <div style="color: #FFD700; font-weight: bold; margin-bottom: 10px;">RECENT SIGNALS:</div>
        <div style="max-height: 200px; overflow-y: auto;">
          ${data.recentSignals.map(s => `
            <div style="background: rgba(0,0,0,0.3); padding: 8px; margin: 5px 0; border-radius: 3px; border-left: 3px solid ${s.decision === 'BUY' ? '#4CAF50' : '#F44336'};">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span style="color: ${s.decision === 'BUY' ? '#4CAF50' : '#F44336'}; font-weight: bold;">${s.decision}</span>
                <span style="color: #FFD700;">${s.confidence}%</span>
                <span style="color: #4CAF50;">${s.result || 'PENDING'}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}


// ============================================================
// STEP 7: INTELLIGENT SIGNAL SCHEDULING
// ============================================================

async function runAISignalLoop(candles, indicators, newsAnalysis) {
  // Run AI analysis every 5 minutes (1 candle)
  setInterval(async () => {
    console.log('[LOOP] Running AI signal analysis...');
    
    // Get latest technical signal (optional - can use just AI)
    const technicalSignal = generateTechnicalSignal(candles, indicators);
    
    // Generate AI signal
    const aiSignal = await generateSignalWithAI(
      candles,
      indicators,
      newsAnalysis,
      technicalSignal
    );

    if (aiSignal && aiSignal.direction) {
      console.log(`[LOOP] New signal generated: ${aiSignal.direction} @ ${aiSignal.adjustedConfidence}%`);
    }
  }, 300000); // Every 5 minutes
}


// ============================================================
// STEP 8: COMBINE AI + TECHNICAL SIGNALS (HYBRID MODE)
// ============================================================

async function generateHybridSignal(candles, indicators, newsAnalysis) {
  // Option 1: Pure AI
  const aiSignal = await generateSignalWithAI(candles, indicators, newsAnalysis, null);
  
  // Option 2: Hybrid (AI + Technical confirmation)
  const technicalSignal = generateTechnicalSignal(candles, indicators);
  
  if (aiSignal && technicalSignal) {
    // Both agree?
    if (aiSignal.direction === technicalSignal.direction) {
      // Boost confidence
      aiSignal.adjustedConfidence = Math.min(100, aiSignal.adjustedConfidence + 10);
      aiSignal.hybrid = true;
      aiSignal.hybridNote = 'AI + Technical both agree - very high confidence';
      console.log('[HYBRID] Both AI and technical agree - confidence boosted!');
    } else if (aiSignal.direction && technicalSignal.direction) {
      // Conflict
      aiSignal.adjustedConfidence = Math.max(0, aiSignal.adjustedConfidence - 10);
      aiSignal.hybrid = true;
      aiSignal.hybridNote = 'Conflict between AI and technical - confidence reduced';
      console.log('[HYBRID] AI and technical disagree - caution!');
    }
  }

  return aiSignal;
}


// ============================================================
// STEP 9: LEARNING & OPTIMIZATION (OPTIONAL)
// ============================================================

function analyzeAIPerformance() {
  const history = aiSignalGenerator.analysisHistory;
  
  // Group by confidence level
  const byConfidence = {};
  history.forEach(s => {
    const confidenceRange = Math.floor(s.confidence / 10) * 10;
    if (!byConfidence[confidenceRange]) {
      byConfidence[confidenceRange] = { total: 0, wins: 0 };
    }
    byConfidence[confidenceRange].total++;
    if (s.result === 'WIN') byConfidence[confidenceRange].wins++;
  });

  console.log('[ANALYSIS] AI Performance by Confidence Level:');
  Object.keys(byConfidence).sort().forEach(range => {
    const data = byConfidence[range];
    const winRate = (data.wins / data.total * 100).toFixed(1);
    console.log(`├─ ${range}%+ confidence: ${data.wins}/${data.total} = ${winRate}% win rate`);
  });

  // Recommendation
  const recommendedConfidenceMin = Object.keys(byConfidence)
    .find(range => {
      const winRate = byConfidence[range].wins / byConfidence[range].total;
      return winRate > 0.7; // 70%+ win rate
    });

  if (recommendedConfidenceMin) {
    console.log(`[RECOMMENDATION] Only take signals at ${recommendedConfidenceMin}%+ confidence`);
  }
}


// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getCurrentSession() {
  const hour = new Date().getUTCHours();
  if (hour >= 7 && hour < 12) return 'London';
  if (hour >= 12 && hour < 17) return 'New York';
  if (hour >= 17 && hour < 22) return 'Overlap';
  return 'Asia';
}

function getLastSignal() {
  const signals = aiSignalGenerator.analysisHistory;
  return signals.length > 0 ? signals[signals.length - 1] : null;
}

function getConsecutiveWins() {
  const signals = aiSignalGenerator.analysisHistory;
  let count = 0;
  for (let i = signals.length - 1; i >= 0; i--) {
    if (signals[i].result === 'WIN') count++;
    else break;
  }
  return count;
}

function getConsecutiveLosses() {
  const signals = aiSignalGenerator.analysisHistory;
  let count = 0;
  for (let i = signals.length - 1; i >= 0; i--) {
    if (signals[i].result === 'LOSS') count++;
    else break;
  }
  return count;
}

function displayActiveTrade(signal) {
  const tradeElement = document.getElementById('active-trade');
  if (tradeElement) {
    tradeElement.innerHTML = `
      <div style="background: rgba(76, 175, 80, 0.1); border: 2px solid #4CAF50; padding: 15px; border-radius: 8px;">
        <div style="color: #4CAF50; font-weight: bold; margin-bottom: 10px;">🟢 ACTIVE TRADE</div>
        <div style="font-size: 13px; color: #CCC; line-height: 1.8;">
          Direction: <span style="color: ${signal.direction === 'BUY' ? '#4CAF50' : '#F44336'}; font-weight: bold;">${signal.direction}</span><br>
          Entry: <span style="font-weight: bold;">$${signal.entry.toFixed(2)}</span><br>
          Stop Loss: <span style="font-weight: bold;">$${signal.stopLoss.toFixed(2)}</span><br>
          Take Profit: <span style="font-weight: bold;">$${signal.takeProfit.toFixed(2)}</span><br>
          Risk: <span style="font-weight: bold;">${signal.slDistance.toFixed(2)} pts</span> | 
          Reward: <span style="font-weight: bold;">${signal.tpDistance.toFixed(2)} pts</span>
        </div>
      </div>
    `;
  }
}
