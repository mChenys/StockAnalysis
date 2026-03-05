"""
Stock Data Service — powered by yfinance
Provides reliable stock data fetching with caching and error handling.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import logging
import time

logger = logging.getLogger(__name__)

# Simple in-memory cache
_cache: Dict[str, Any] = {}
CACHE_TTL = 300  # 5 minutes


def _get_cached(key: str):
    if key in _cache:
        entry = _cache[key]
        if time.time() - entry["ts"] < CACHE_TTL:
            return entry["data"]
    return None


def _set_cached(key: str, data: Any):
    _cache[key] = {"data": data, "ts": time.time()}


# ─── Real-time Price ────────────────────────────────────────

def get_stock_price(symbol: str) -> Dict[str, Any]:
    """Get real-time stock price and basic info."""
    cache_key = f"price_{symbol}"
    
    # Check if it's a weekend
    from datetime import datetime
    now_dt = datetime.now()
    is_weekend = now_dt.weekday() >= 5 # 5=Sat, 6=Sun
    ttl = 3600 if is_weekend else CACHE_TTL
    
    # Try cache first
    cached_entry = _cache.get(cache_key)
    if cached_entry:
        if time.time() - cached_entry["ts"] < ttl:
             return cached_entry["data"]

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
    except Exception as e:
        logger.error(f"yfinance error for {symbol}: {e}")
        # Fallback to expired cache if available
        if cache_key in _cache:
            logger.info(f"Using stale cache for {symbol} due to error")
            return _cache[cache_key]["data"]
        raise e

    # Determine market session based on US Eastern time
    now_et = datetime.now()
    hour = now_et.hour
    if 4 <= hour < 9:
        session = "盘前"
    elif 9 <= hour < 16:
        session = "盘中"
    elif 16 <= hour < 20:
        session = "盘后"
    else:
        session = "休市"

    current_price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose", 0)

    change_percent = 0.0
    if prev_close and prev_close > 0:
        change_percent = round((current_price - prev_close) / prev_close * 100, 2)

    result = {
        "symbol": symbol.upper(),
        "currentPrice": current_price,
        "previousClose": prev_close,
        "changePercent": change_percent,
        "session": session,
        "high": info.get("dayHigh") or info.get("regularMarketDayHigh", 0),
        "low": info.get("dayLow") or info.get("regularMarketDayLow", 0),
        "volume": info.get("volume") or info.get("regularMarketVolume", 0),
        "marketCap": info.get("marketCap", 0),
        "name": info.get("shortName", symbol),
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "pe_ratio": info.get("trailingPE", None),
        "forward_pe": info.get("forwardPE", None),
        "dividend_yield": info.get("dividendYield", None),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh", None),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow", None),
        "timestamp": datetime.now().isoformat(),
        "source": "yfinance"
    }

    _set_cached(cache_key, result)
    return result


# ─── Historical Data ────────────────────────────────────────

def get_historical_data(symbol: str, period: str = "3mo", interval: str = "1d") -> Dict[str, Any]:
    """Get historical OHLCV data."""
    cache_key = f"hist_{symbol}_{period}_{interval}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval)

    if df.empty:
        return {"symbol": symbol, "period": period, "dataPoints": 0, "data": []}

    # Only return last 60 data points to keep API response manageable
    df = df.tail(60)

    data = []
    for idx, row in df.iterrows():
        data.append({
            "date": idx.strftime("%Y-%m-%d"),
            "open": round(row["Open"], 2),
            "high": round(row["High"], 2),
            "low": round(row["Low"], 2),
            "close": round(row["Close"], 2),
            "volume": int(row["Volume"])
        })

    result = {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "dataPoints": len(data),
        "data": data
    }

    _set_cached(cache_key, result)
    return result


# ─── Technical Indicators ───────────────────────────────────

def get_technical_indicators(symbol: str, period: str = "1y") -> Dict[str, Any]:
    """Calculate technical indicators from historical data."""
    cache_key = f"tech_{symbol}_{period}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period)

    if df.empty or len(df) < 26:
        return {"symbol": symbol, "error": "Insufficient data for technical analysis"}

    closes = df["Close"]

    # SMA
    sma20 = round(closes.rolling(20).mean().iloc[-1], 2) if len(closes) >= 20 else None
    sma50 = round(closes.rolling(50).mean().iloc[-1], 2) if len(closes) >= 50 else None
    sma200 = round(closes.rolling(200).mean().iloc[-1], 2) if len(closes) >= 200 else None

    # EMA
    ema12 = round(closes.ewm(span=12).mean().iloc[-1], 2)
    ema26 = round(closes.ewm(span=26).mean().iloc[-1], 2)

    # RSI (14)
    delta = closes.diff()
    gain = delta.where(delta > 0, 0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
    rs = gain / loss
    rsi = round((100 - 100 / (1 + rs)).iloc[-1], 2)

    # MACD
    macd_line = closes.ewm(span=12).mean() - closes.ewm(span=26).mean()
    signal_line = macd_line.ewm(span=9).mean()
    histogram = macd_line - signal_line

    # Bollinger Bands
    bb_sma = closes.rolling(20).mean()
    bb_std = closes.rolling(20).std()
    bb_upper = round((bb_sma + 2 * bb_std).iloc[-1], 2) if len(closes) >= 20 else None
    bb_middle = round(bb_sma.iloc[-1], 2) if len(closes) >= 20 else None
    bb_lower = round((bb_sma - 2 * bb_std).iloc[-1], 2) if len(closes) >= 20 else None

    current_price = round(closes.iloc[-1], 2)

    result = {
        "symbol": symbol.upper(),
        "currentPrice": current_price,
        "sma20": sma20,
        "sma50": sma50,
        "sma200": sma200,
        "ema12": ema12,
        "ema26": ema26,
        "rsi": rsi,
        "macd": {
            "macd": round(macd_line.iloc[-1], 4),
            "signal": round(signal_line.iloc[-1], 4),
            "histogram": round(histogram.iloc[-1], 4)
        },
        "bollinger": {
            "upper": bb_upper,
            "middle": bb_middle,
            "lower": bb_lower
        },
        "trend": "bullish" if current_price > (sma50 or 0) else "bearish",
        "rsi_signal": "超买" if rsi > 70 else ("超卖" if rsi < 30 else "中性"),
        "timestamp": datetime.now().isoformat(),
        "source": "yfinance"
    }

    _set_cached(cache_key, result)
    return result


# ─── Stock Comparison ───────────────────────────────────────

def compare_stocks(symbols: List[str]) -> Dict[str, Any]:
    """Compare multiple stocks side by side."""
    results = []
    for symbol in symbols:
        try:
            price_data = get_stock_price(symbol)
            tech_data = get_technical_indicators(symbol)
            results.append({
                "symbol": symbol.upper(),
                "name": price_data.get("name", symbol),
                "currentPrice": price_data["currentPrice"],
                "changePercent": price_data["changePercent"],
                "volume": price_data["volume"],
                "marketCap": price_data.get("marketCap", 0),
                "pe_ratio": price_data.get("pe_ratio"),
                "rsi": tech_data.get("rsi", "N/A"),
                "sma20": tech_data.get("sma20", "N/A"),
                "sma50": tech_data.get("sma50", "N/A"),
                "macd": tech_data.get("macd", {}).get("macd", "N/A"),
                "trend": tech_data.get("trend", "N/A"),
                "error": None
            })
        except Exception as e:
            results.append({"symbol": symbol, "error": str(e)})

    return {"comparison": results}


# ─── Portfolio Analysis ─────────────────────────────────────

def analyze_portfolio(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze a portfolio of stock holdings."""
    portfolio_data = []
    for h in holdings:
        try:
            price_data = get_stock_price(h["symbol"])
            current_price = price_data["currentPrice"]
            shares = h.get("shares", 0)
            avg_cost = h.get("avgCost", 0)

            current_value = current_price * shares
            cost_basis = avg_cost * shares
            pnl = current_value - cost_basis
            pnl_pct = round(pnl / cost_basis * 100, 2) if cost_basis > 0 else 0

            portfolio_data.append({
                "symbol": h["symbol"].upper(),
                "name": price_data.get("name", h["symbol"]),
                "shares": shares,
                "avgCost": avg_cost,
                "currentPrice": current_price,
                "currentValue": round(current_value, 2),
                "costBasis": round(cost_basis, 2),
                "pnl": round(pnl, 2),
                "pnlPercent": pnl_pct,
                "changeToday": price_data["changePercent"],
                "weight": 0  # will be calculated below
            })
        except Exception as e:
            portfolio_data.append({"symbol": h["symbol"], "error": str(e)})

    # Calculate weights
    total_value = sum(h.get("currentValue", 0) for h in portfolio_data if "error" not in h or h.get("error") is None)
    if total_value > 0:
        for h in portfolio_data:
            if h.get("currentValue"):
                h["weight"] = round(h["currentValue"] / total_value * 100, 2)

    total_cost = sum(h.get("costBasis", 0) for h in portfolio_data if h.get("costBasis"))
    total_pnl = total_value - total_cost

    return {
        "holdings": portfolio_data,
        "summary": {
            "totalValue": round(total_value, 2),
            "totalCost": round(total_cost, 2),
            "totalPnl": round(total_pnl, 2),
            "totalPnlPercent": round(total_pnl / total_cost * 100, 2) if total_cost > 0 else 0,
            "positionCount": len(portfolio_data)
        }
    }


# ─── Market News ────────────────────────────────────────────

def get_market_news(query: str = "财经股票", limit: int = 20) -> List[Dict[str, Any]]:
    """Get market news using duckduckgo-search."""
    cache_key = f"news_{query}_{limit}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    try:
        from duckduckgo_search import DDGS
        ddgs = DDGS()
        results = []
        try:
            results = ddgs.news(query, max_results=limit)
        except Exception as e:
            logger.warning(f"DuckDuckGo search failed, falling back to yfinance: {e}")
            
        news_list = []
        if results:
            for item in results:
                # DDGS returns: date, title, body, url, image, source
                news_list.append({
                    "title": item.get("title", ""),
                    "content": item.get("body", ""),
                    "url": item.get("url", ""),
                    "sourceId": item.get("source", "网速财经"),
                    "publishedAt": item.get("date", datetime.now().isoformat())
                })
                
        # Try yfinance as a fallback
        if not news_list:
            import yfinance as yf
            
            def translate_text(text):
                if not text:
                    return text
                try:
                    from deep_translator import GoogleTranslator
                    return GoogleTranslator(source='auto', target='zh-CN').translate(text)
                except Exception as e:
                    logger.warning(f"Translation failed: {e}")
                    return text
                    
            # 提取 query 中的有效 ticker，支持以逗号或空格分割
            import re
            query_tickers = [w.strip().upper() for w in re.split(r'[, ]+', query) if w.strip() and re.match(r'^[A-Za-z0-9\-\.]+$', w.strip())]
            tickers = query_tickers if query_tickers else ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA"]
            
            all_yf_news = []
            for t in tickers:
                if t in ["A", "A股"]: continue # 进一步防误杀
                try:
                    res = yf.Ticker(t).news
                    if res:
                        all_yf_news.extend(res)
                except Exception:
                    pass
            
            # 根据 URL 进行新闻去重
            seen_urls = set()
            unique_news = []
            for item in all_yf_news:
                content = item.get("content", item)
                click_though = content.get("clickThroughUrl") or {}
                canonical = content.get("canonicalUrl") or {}
                url = click_though.get("url") or canonical.get("url") or ""
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    unique_news.append(item)
            
            # 按时间倒序排序，确保最新资讯在前面
            def get_pub_date(item):
                content = item.get("content", item)
                return content.get("pubDate", "")
            unique_news.sort(key=get_pub_date, reverse=True)
            
            for item in unique_news[:limit]:
                content = item.get("content", item)
                
                title = content.get("title", "")
                summary = content.get("summary", "")
                
                # Fetch URL
                # Fetch URL
                click_though = content.get("clickThroughUrl") or {}
                canonical = content.get("canonicalUrl") or {}
                url = click_though.get("url") or canonical.get("url") or ""
                
                # Fetch provider
                provider = content.get("provider") or {}
                source = provider.get("displayName") or "Yahoo Finance"
                
                # Fetch date
                pub_date = content.get("pubDate", datetime.now().isoformat())
                
                if title:
                    zh_title = translate_text(title)
                    zh_summary = translate_text(summary)
                    news_list.append({
                        "title": zh_title,
                        "content": zh_summary,
                        "url": url,
                        "sourceId": source,
                        "publishedAt": pub_date
                    })
        
        _set_cached(cache_key, news_list)
        return news_list
    except Exception as e:
        logger.error(f"Error fetching news: {e}")
        return []

def check_ma_cross(symbol: str) -> Dict[str, Any]:
    """Check for 5/20 MA Golden Cross or Death Cross."""
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="60d") # Enough for 20MA
        if len(df) < 21:
            return {"cross": None, "ma5": 0, "ma20": 0}
        
        # Ensure we have clean closing prices
        prices = df['Close']
        ma5 = prices.rolling(window=5).mean()
        ma20 = prices.rolling(window=20).mean()
        
        last_ma5 = ma5.iloc[-1]
        last_ma20 = ma20.iloc[-1]
        prev_ma5 = ma5.iloc[-2]
        prev_ma20 = ma20.iloc[-2]
        
        cross = None
        if prev_ma5 <= prev_ma20 and last_ma5 > last_ma20:
            cross = "golden_cross"
        elif prev_ma5 >= prev_ma20 and last_ma5 < last_ma20:
            cross = "death_cross"
            
        return {
            "cross": cross,
            "ma5": float(last_ma5),
            "ma20": float(last_ma20)
        }
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"MA Cross error for {symbol}: {e}")
        return {"cross": None}

