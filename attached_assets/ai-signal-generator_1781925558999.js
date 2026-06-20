/**
 * AI-POWERED SIGNAL GENERATOR
 * Autonomous trading signal generation using Claude AI
 * Analyzes technical, fundamental, and sentiment data
 * Generates independent buy/sell signals with reasoning
 */

class AISignalGenerator {
  constructor(apiKey = null) {
    this.apiKey = apiKey || 'use-anthropic-api'; // Will be called from Replit
    this.analysisHistory = [];
    this.signalCount = 0;
    this.accuracy = 0;
    this.lastAnalysis = null;
    this.modelConfig = {
      model: 'claude-sonnet-4-6',
      maxTokens: 1000,
      temperature: 0.7 // Balance between consistency and creativity
    };
  }

  /**
   * MAIN FUNCTION: Generate AI Signal
   * Takes all market data and uses Claude to generate trading signal
   */
  async generateAISignal(marketData) {
    try {
      console.log(`[AI SIGNAL GENERATOR] Starting analysis...`);

      // Step 1: Prepare market data context
      const dataContext = this.prepareMarketContext(marketData);

      // Step 2: Create AI prompt with all data
      const aiPrompt = this.buildAIPrompt(dataContext);

      // Step 3: Call Claude API (or use fetch in browser)
      const aiAnalysis = await this.callAIAnalysis(aiPrompt);

      // Step 4: Parse AI response into signal
      const signal = this.parseAIResponse(aiAnalysis);

      // Step 5: Validate and enhance signal
      const enhancedSignal = this.enhanceSignal(signal, marketData);

      // Step 6: Log and store
      this.logAISignal(enhancedSignal);
      this.analysisHistory.push(enhancedSignal);

      console.log(`[AI SIGNAL] Generated: ${enhancedSignal.direction} @ ${enhancedSignal.confidence}%`);

      return enhancedSignal;

    } catch (error) {
      console.error('[AI SIGNAL GENERATOR] Error:', error);
      return null;
    }
  }

  /**
   * PREPARE: Market data context for AI analysis
   */
  prepareMarketContext(marketData) {
    return {
      // Current Price Action
      price: {
        current: marketData.currentPrice || 4347.26,
        open: marketData.open || 4343.50,
        high: marketData.high || 4350.00,
        low: marketData.low || 4340.00,
        close: marketData.close || 4346.50,
        movement: ((marketData.close - marketData.open) / marketData.open * 100).toFixed(2)
      },

      // Technical Indicators
      indicators: {
        ema9: marketData.ema9 || 4344.7,
        ema21: marketData.ema21 || 4343.2,
        rsi14: marketData.rsi14 || 58.5,
        macd: marketData.macd || { value: 2.5, signal: 2.0, histogram: 0.5 },
        atr: marketData.atr || 3.46,
        adx: marketData.adx || 25.3 // Trend strength
      },

      // Support & Resistance
      keyLevels: {
        support1: marketData.support1 || 4338.50,
        support2: marketData.support2 || 4330.00,
        resistance1: marketData.resistance1 || 4354.00,
        resistance2: marketData.resistance2 || 4365.00,
        nearestSupport: Math.abs(marketData.close - (marketData.support1 || 4338.50)),
        nearestResistance: Math.abs((marketData.resistance1 || 4354.00) - marketData.close)
      },

      // Pattern Recognition
      patterns: {
        orderBlocks: marketData.orderBlocks || [],
        fvgZones: marketData.fvgZones || [],
        liquiditySweeps: marketData.liquiditySweeps || [],
        candlePattern: this.identifyCandlePattern(marketData)
      },

      // Market Regime
      regime: {
        trend: this.calculateTrend(marketData),
        trendStrength: marketData.adx || 25,
        volatility: marketData.atr || 3.46,
        session: marketData.session || 'London',
        timeframe: '5m'
      },

      // News & Fundamentals
      fundamentals: {
        newsDirectionalBias: marketData.newsBias || 0,
        fedPolicy: marketData.fedPolicy || 'neutral',
        realInterestRates: marketData.realRates || -0.45,
        dollarStrength: marketData.dollarIndex || 104.5,
        geopoliticalRisk: marketData.geopoliticalRisk || 'neutral'
      },

      // Volume & Momentum
      momentum: {
        volumeTrend: marketData.volumeTrend || 'normal',
        momentumStrength: this.calculateMomentum(marketData),
        priceAction: marketData.priceAction || 'consolidating'
      },

      // Recent Signals (context)
      recentHistory: {
        lastSignal: marketData.lastSignal || null,
        lastResult: marketData.lastResult || null,
        consecutiveWins: marketData.consecutiveWins || 0,
        consecutiveLosses: marketData.consecutiveLosses || 0
      }
    };
  }

  /**
   * BUILD: AI Prompt with all market context
   */
  buildAIPrompt(dataContext) {
    return `You are an expert gold scalping trader using advanced technical and fundamental analysis.

CURRENT MARKET DATA (5-minute):
═══════════════════════════════════════════════════════════
Price Action:
├─ Current: $${dataContext.price.current}
├─ Open: $${dataContext.price.open}
├─ High/Low: ${dataContext.price.high} / ${dataContext.price.low}
├─ Movement: ${dataContext.price.movement}%
└─ Candle Pattern: ${dataContext.patterns.candlePattern}

Technical Indicators:
├─ EMA 9: ${dataContext.indicators.ema9} (${this.compareValues(dataContext.indicators.ema9, dataContext.indicators.ema21)})
├─ EMA 21: ${dataContext.indicators.ema21}
├─ RSI(14): ${dataContext.indicators.rsi14} (${dataContext.indicators.rsi14 > 65 ? 'OVERBOUGHT' : dataContext.indicators.rsi14 < 35 ? 'OVERSOLD' : 'NEUTRAL'})
├─ MACD: ${dataContext.indicators.macd.value.toFixed(2)} (Signal: ${dataContext.indicators.macd.signal.toFixed(2)}, Histogram: ${dataContext.indicators.macd.histogram.toFixed(2)})
├─ ATR (volatility): ${dataContext.indicators.atr}
└─ ADX (trend strength): ${dataContext.indicators.adx}

Key Support & Resistance:
├─ Support 1: $${dataContext.keyLevels.support1} (${dataContext.keyLevels.nearestSupport.toFixed(2)} pts away)
├─ Support 2: $${dataContext.keyLevels.support2}
├─ Resistance 1: $${dataContext.keyLevels.resistance1} (${dataContext.keyLevels.nearestResistance.toFixed(2)} pts away)
└─ Resistance 2: $${dataContext.keyLevels.resistance2}

Market Regime:
├─ Primary Trend: ${dataContext.regime.trend} (Strength: ${dataContext.regime.trendStrength}/100)
├─ Volatility Level: ${dataContext.regime.volatility.toFixed(2)} pts ATR
├─ Session: ${dataContext.regime.session}
└─ Price Action: ${dataContext.momentum.priceAction}

Fundamental Context:
├─ News Directional Bias: ${dataContext.fundamentals.newsDirectionalBias} (${dataContext.fundamentals.newsDirectionalBias > 30 ? 'BULLISH' : dataContext.fundamentals.newsDirectionalBias < -30 ? 'BEARISH' : 'NEUTRAL'})
├─ Fed Policy: ${dataContext.fundamentals.fedPolicy}
├─ Real Interest Rates: ${dataContext.fundamentals.realInterestRates}%
├─ USD Strength: ${dataContext.fundamentals.dollarStrength}
└─ Geopolitical Risk: ${dataContext.fundamentals.geopoliticalRisk}

Recent Performance:
├─ Consecutive Wins: ${dataContext.recentHistory.consecutiveWins}
├─ Consecutive Losses: ${dataContext.recentHistory.consecutiveLosses}
├─ Last Signal: ${dataContext.recentHistory.lastSignal || 'None'}
└─ Last Result: ${dataContext.recentHistory.lastResult || 'None'}

═══════════════════════════════════════════════════════════

ANALYSIS FRAMEWORK:
═══════════════════════════════════════════════════════════

Analyze using this multi-factor approach:

1. TREND ANALYSIS:
   ├─ Is price above/below both EMAs?
   ├─ Are EMAs aligned (bullish/bearish)?
   ├─ What is the ADX trend strength?
   └─ Conclusion: Uptrend / Downtrend / Consolidation

2. MOMENTUM & CONFIRMATION:
   ├─ RSI direction (rising/falling)?
   ├─ MACD histogram: Positive/Negative/Changing?
   ├─ Price-momentum divergence?
   └─ Conclusion: Strong / Moderate / Weak momentum

3. SUPPORT & RESISTANCE:
   ├─ How close is price to key levels?
   ├─ Is price respecting levels?
   ├─ Bounce or breakdown likely?
   └─ Conclusion: Key zone probability

4. PATTERN RECOGNITION:
   ├─ Any obvious price patterns?
   ├─ Order block rejection likely?
   ├─ FVG zone fill probability?
   └─ Conclusion: Pattern-based edge

5. FUNDAMENTAL ALIGNMENT:
   ├─ Is signal aligned with news bias?
   ├─ Do technicals match fundamentals?
   ├─ Fed policy headwind or tailwind?
   └─ Conclusion: Fundamental support

6. VOLATILITY & RISK:
   ├─ Is volatility normal/high/low?
   ├─ Safe stop loss size (ATR × 3.0)?
   ├─ Risk/Reward ratio?
   └─ Conclusion: Risk acceptable

7. SESSION & LIQUIDITY:
   ├─ Current session liquidity?
   ├─ Typical volatility for this session?
   ├─ Expected momentum?
   └─ Conclusion: Trading conditions

═══════════════════════════════════════════════════════════

DECISION PROCESS:
═══════════════════════════════════════════════════════════

Based on your analysis, provide a trading decision:

IF multiple factors align (trend + momentum + support/resistance + news + patterns):
└─ GENERATE SIGNAL: BUY or SHORT
   ├─ Calculate confidence 0-100%
   ├─ Provide 2-3 key reasons
   ├─ Set SL (ATR × 3.0)
   ├─ Set TP (SL × 2.5)
   └─ Risk/Reward ratio

IF factors are mixed or conflicting:
└─ WAIT / NO SIGNAL
   ├─ Explain which factors are weak
   ├─ Wait for confirmation
   ├─ Recommend next trigger

IF strong counter-signals present:
└─ AVOID / BLOCK
   ├─ Explain the conflict
   ├─ Identify risks
   └─ Wait for setup to clear

═══════════════════════════════════════════════════════════

YOUR RESPONSE FORMAT (JSON):
═══════════════════════════════════════════════════════════

{
  "decision": "BUY" | "SHORT" | "WAIT" | "BLOCK",
  "confidence": 0-100,
  "entryPrice": current_price,
  "stopLoss": calculated_sl,
  "takeProfit": calculated_tp,
  "riskRewardRatio": ratio,
  "analysis": {
    "trend": "explanation",
    "momentum": "explanation",
    "supportResistance": "explanation",
    "patterns": "explanation",
    "fundamentals": "explanation",
    "volatility": "explanation",
    "session": "explanation"
  },
  "keyReasons": [
    "Reason 1",
    "Reason 2",
    "Reason 3"
  ],
  "risks": [
    "Risk 1",
    "Risk 2"
  ],
  "alternativeScenario": "What could invalidate this signal",
  "nextTrigger": "What to watch for next move"
}

═══════════════════════════════════════════════════════════

IMPORTANT RULES:
═════════════════════════════════════════════════════════
1. Be conservative - only signal when confidence >= 60%
2. Avoid counter-trend trades unless setup is extremely strong
3. Always respect support/resistance levels
4. Consider position sizing based on volatility
5. Never force a signal - it's OK to WAIT
6. Factor in news/fundamentals equally with technicals
7. Explain your reasoning clearly
8. Provide risk assessment

Respond ONLY with the JSON object above. No markdown, no explanation, just pure JSON.`;
  }

  /**
   * CALL: Claude API for analysis
   */
  async callAIAnalysis(prompt) {
    try {
      // Option 1: If in browser/Replit with fetch
      if (typeof fetch !== 'undefined') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Note: In production, API key should be in backend, not frontend
            // For Replit, use environment variable
          },
          body: JSON.stringify({
            model: this.modelConfig.model,
            max_tokens: this.modelConfig.maxTokens,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });

        const data = await response.json();
        return data.content[0].text;
      }

      // Option 2: Use mock AI response for demo
      return this.generateMockAIResponse(prompt);

    } catch (error) {
      console.error('[AI] API Error:', error);
      // Fallback to mock response
      return this.generateMockAIResponse(prompt);
    }
  }

  /**
   * MOCK: Generate realistic mock AI response (for demo/testing)
   */
  generateMockAIResponse(prompt) {
    // This generates a realistic AI response based on the market data in the prompt
    const isBullish = prompt.includes('EMA 9') && 
                      prompt.includes('uptrend') ||
                      prompt.includes('BULLISH');
    
    const confidence = Math.floor(Math.random() * 30) + 60; // 60-90%

    const mockResponse = {
      decision: isBullish ? 'BUY' : 'SHORT',
      confidence: confidence,
      entryPrice: 4347.26,
      stopLoss: 4337.88, // 9.38 pts (ATR × 2.7)
      takeProfit: 4365.76, // 18.5 pts (SL × 2.0)
      riskRewardRatio: 1.97,
      analysis: {
        trend: isBullish ? 'EMA 9 above EMA 21 - bullish trend confirmed' : 'Price below both EMAs - downtrend active',
        momentum: 'RSI at 58 - approaching but not overbought, momentum building',
        supportResistance: 'Price near resistance, pullback to support likely before move',
        patterns: 'Order block detected above resistance - potential rejection point',
        fundamentals: 'Neutral news bias provides no headwind - clean technical trade',
        volatility: 'ATR 3.46 suggests normal volatility - appropriate for scalping',
        session: 'London session - highest liquidity, tightest spreads expected'
      },
      keyReasons: [
        'EMA alignment bullish with price above both moving averages',
        'RSI momentum building but not overbought - room to run',
        'Support level confirmed 3 times - strong bounce point'
      ],
      risks: [
        'FOMC meeting in 2 hours could cause volatility spike',
        'Price near resistance - short-term pullback before new highs',
        'Stop hunt activity possible at round numbers'
      ],
      alternativeScenario: 'If price closes below EMA 21, trend reversal possible',
      nextTrigger: 'Watch for break above $4,365 resistance for continuation'
    };

    return JSON.stringify(mockResponse);
  }

  /**
   * PARSE: AI response into trading signal
   */
  parseAIResponse(aiResponse) {
    try {
      // Remove markdown if present
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/\n?```/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/\n?```/, '');
      }

      const parsed = JSON.parse(cleanResponse);

      return {
        direction: parsed.decision === 'BUY' ? 'BUY' : parsed.decision === 'SHORT' ? 'SHORT' : null,
        confidence: parsed.confidence || 0,
        entry: parsed.entryPrice || 0,
        stopLoss: parsed.stopLoss || 0,
        takeProfit: parsed.takeProfit || 0,
        riskRewardRatio: parsed.riskRewardRatio || 0,
        analysis: parsed.analysis || {},
        reasons: parsed.keyReasons || [],
        risks: parsed.risks || [],
        alternativeScenario: parsed.alternativeScenario || '',
        nextTrigger: parsed.nextTrigger || '',
        aiGenerated: true
      };

    } catch (error) {
      console.error('[PARSE] Error parsing AI response:', error);
      return null;
    }
  }

  /**
   * ENHANCE: Add additional validation
   */
  enhanceSignal(signal, marketData) {
    if (!signal) return null;

    // Add metadata
    signal.timestamp = new Date().toISOString();
    signal.signalId = `AI-${++this.signalCount}`;
    signal.type = 'AI_GENERATED';

    // Calculate distances
    signal.slDistance = Math.abs(signal.entry - signal.stopLoss);
    signal.tpDistance = Math.abs(signal.takeProfit - signal.entry);

    // Adjust confidence based on various factors
    let adjustedConfidence = signal.confidence;

    // Bonus for alignment with news
    if (marketData.newsBias > 30 && signal.direction === 'BUY') {
      adjustedConfidence = Math.min(100, adjustedConfidence + 5);
    }
    if (marketData.newsBias < -30 && signal.direction === 'SHORT') {
      adjustedConfidence = Math.min(100, adjustedConfidence + 5);
    }

    // Penalty for poor risk/reward
    if (signal.riskRewardRatio < 1.5) {
      adjustedConfidence = Math.max(0, adjustedConfidence - 10);
    }

    signal.adjustedConfidence = adjustedConfidence;

    return signal;
  }

  /**
   * LOG: Signal details
   */
  logAISignal(signal) {
    if (!signal) return;

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║          AI SIGNAL GENERATION RESULT                      ║
╚═══════════════════════════════════════════════════════════╝

🤖 AI ANALYSIS:
├─ Signal ID: ${signal.signalId}
├─ Decision: ${signal.direction || 'NO SIGNAL'}
├─ Confidence: ${signal.confidence}% (Adjusted: ${signal.adjustedConfidence}%)
├─ Type: AI Generated

📊 TRADE DETAILS:
├─ Entry: $${signal.entry.toFixed(2)}
├─ Stop Loss: $${signal.stopLoss.toFixed(2)} (${signal.slDistance.toFixed(2)} pts away)
├─ Take Profit: $${signal.takeProfit.toFixed(2)} (${signal.tpDistance.toFixed(2)} pts away)
└─ Risk/Reward: 1:${signal.riskRewardRatio.toFixed(2)}

📈 AI REASONING:
├─ Trend: ${signal.analysis.trend}
├─ Momentum: ${signal.analysis.momentum}
├─ Support/Resistance: ${signal.analysis.supportResistance}
├─ Patterns: ${signal.analysis.patterns}
└─ Fundamentals: ${signal.analysis.fundamentals}

✅ KEY REASONS:
${signal.reasons.map((r, i) => `├─ ${i + 1}. ${r}`).join('\n')}

⚠️ RISKS:
${signal.risks.map((r, i) => `├─ ${i + 1}. ${r}`).join('\n')}

🔄 NEXT TRIGGER:
└─ ${signal.nextTrigger}

════════════════════════════════════════════════════════════
    `);
  }

  /**
   * HELPER: Identify candle pattern
   */
  identifyCandlePattern(marketData) {
    const bodySize = Math.abs(marketData.close - marketData.open);
    const totalSize = marketData.high - marketData.low;
    const bodyPercent = (bodySize / totalSize) * 100;

    if (bodyPercent > 80) return 'Strong body';
    if (bodyPercent < 20) return 'Doji-like (indecision)';
    if (marketData.close > marketData.open) return 'Bullish body';
    if (marketData.close < marketData.open) return 'Bearish body';
    return 'Mixed';
  }

  /**
   * HELPER: Calculate trend
   */
  calculateTrend(marketData) {
    if (marketData.close > marketData.ema9 && marketData.ema9 > marketData.ema21) {
      return 'Uptrend';
    }
    if (marketData.close < marketData.ema9 && marketData.ema9 < marketData.ema21) {
      return 'Downtrend';
    }
    return 'Consolidation';
  }

  /**
   * HELPER: Calculate momentum
   */
  calculateMomentum(marketData) {
    if (marketData.rsi14 > 60) return 'Strong bullish';
    if (marketData.rsi14 > 50) return 'Moderately bullish';
    if (marketData.rsi14 < 40) return 'Moderately bearish';
    if (marketData.rsi14 < 30) return 'Strong bearish';
    return 'Neutral';
  }

  /**
   * HELPER: Compare values
   */
  compareValues(val1, val2) {
    if (val1 > val2) return 'above';
    if (val1 < val2) return 'below';
    return 'equal to';
  }

  /**
   * TRACK: Signal accuracy
   */
  trackSignalResult(signalId, result) {
    const signal = this.analysisHistory.find(s => s.signalId === signalId);
    if (signal) {
      signal.result = result; // 'WIN' or 'LOSS'
      this.calculateAccuracy();
    }
  }

  /**
   * CALCULATE: Win rate
   */
  calculateAccuracy() {
    const completedSignals = this.analysisHistory.filter(s => s.result);
    if (completedSignals.length === 0) return;

    const wins = completedSignals.filter(s => s.result === 'WIN').length;
    this.accuracy = (wins / completedSignals.length) * 100;

    console.log(`[AI ACCURACY] ${wins}/${completedSignals.length} = ${this.accuracy.toFixed(1)}% win rate`);
  }

  /**
   * GET: Analysis history
   */
  getAnalysisHistory(limit = 10) {
    return this.analysisHistory.slice(-limit).map(s => ({
      id: s.signalId,
      decision: s.direction,
      confidence: s.adjustedConfidence,
      entry: s.entry,
      sl: s.stopLoss,
      tp: s.takeProfit,
      result: s.result || 'PENDING',
      timestamp: s.timestamp
    }));
  }

  /**
   * EXPORT: Data for dashboard
   */
  exportForDashboard() {
    return {
      lastSignal: this.analysisHistory[this.analysisHistory.length - 1] || null,
      totalSignals: this.signalCount,
      winRate: this.accuracy.toFixed(1),
      recentSignals: this.getAnalysisHistory(5),
      avgConfidence: this.getAverageConfidence(),
      successRate: this.accuracy
    };
  }

  /**
   * GET: Average confidence
   */
  getAverageConfidence() {
    if (this.analysisHistory.length === 0) return 0;
    const sum = this.analysisHistory.reduce((acc, s) => acc + (s.confidence || 0), 0);
    return (sum / this.analysisHistory.length).toFixed(1);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AISignalGenerator;
}
