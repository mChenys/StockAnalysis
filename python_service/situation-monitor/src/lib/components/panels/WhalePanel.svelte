<script lang="ts">
	import { Panel } from '$lib/components/common';
	import type { WhaleTransaction } from '$lib/api';

	interface Props {
		whales?: WhaleTransaction[];
		loading?: boolean;
		error?: string | null;
	}

	let { whales = [], loading = false, error = null }: Props = $props();

	const count = $derived(whales.length);

	function formatAmount(amt: number): string {
		return amt >= 1000 ? (amt / 1000).toFixed(1) + 'K' : amt.toFixed(2);
	}

	function formatUSD(usd: number): string {
		if (usd >= 1e9) return '$' + (usd / 1e9).toFixed(1) + 'B';
		if (usd >= 1e6) return '$' + (usd / 1e6).toFixed(1) + 'M';
		return '$' + (usd / 1e3).toFixed(0) + 'K';
	}

	function formatTime(timestamp: string): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return '刚刚';
		if (diffMins < 60) return `${diffMins}分钟前`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}小时前`;
		return date.toLocaleDateString();
	}

	function getSignal(type: string): { label: string; color: string; description: string } {
		switch (type) {
			case 'inflow':
				return { 
					label: '存入交易所 (币市利空)', 
					color: '#ef4444', 
					description: '大户转入，抛售压力增大。' 
				};
			case 'outflow':
				return { 
					label: '提出现金 (币市利好)', 
					color: '#22c55e', 
					description: '大户提现，机构增持信号。' 
				};
			default:
				return { 
					label: '钱包转移 (中性)', 
					color: '#94a3b8', 
					description: '内部钱包转移或场外交易。' 
				};
		}
	}

	function getExplorerUrl(coin: string, hash: string): string {
		const c = coin.toUpperCase();
		if (c === 'BTC') return `https://www.blockchain.com/explorer/transactions/btc/${hash}`;
		if (c === 'ETH') return `https://etherscan.io/tx/${hash}`;
		if (c === 'SOL') return `https://solscan.io/tx/${hash}`;
		return `https://www.blockchain.com/explorer/search?search=${hash}`;
	}

	function formatHash(hash: string): string {
		if (hash.length <= 12) return hash;
		return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
	}
</script>

<Panel id="whales" title="加密巨鲸监控 (Crypto Whale)" {count} {loading} {error}>
	<div class="info-legend">
		<div class="legend-item bullish">
			<span class="l-icon">↑</span>
			<span class="l-text">提现 (币市看涨/增持)</span>
		</div>
		<div class="legend-item bearish">
			<span class="l-icon">↓</span>
			<span class="l-text">转入 (币市看跌/减持)</span>
		</div>
		<div class="macro-hint">⚠️ 提示：币市巨鲸动向往往领先于科技股风险偏好变化</div>
	</div>

	{#if whales.length === 0 && !loading && !error}
		<div class="empty-state">暂无交易记录</div>
	{:else}
		<div class="whale-list">
			{#each whales as whale, i (whale.hash + i)}
				{@const signal = getSignal(whale.type)}
				<a
					href={getExplorerUrl(whale.coin, whale.hash)}
					target="_blank"
					rel="noopener noreferrer"
					class="whale-card {whale.type}"
				>
					<div class="card-row">
						<div class="coin-info">
							<span class="badge">{whale.coin}</span>
							<span class="amount">{formatAmount(whale.amount)}</span>
						</div>
						<span class="time">{formatTime(whale.timestamp)}</span>
					</div>

					<div class="card-row mid">
						<div class="flow-text">
							<span class="f-from">{whale.from}</span>
							<span class="f-arrow">→</span>
							<span class="f-to">{whale.to}</span>
						</div>
						<div class="price-info">
							<span class="usd">{formatUSD(whale.usd)}</span>
							<span class="cny">≈ {(whale.usd * 7.2 / 1e8).toFixed(2)} 亿元</span>
						</div>
					</div>

					<div class="card-row footer">
						<span class="signal-text" style="color: {signal.color}">
							{whale.type === 'outflow' ? '▲' : whale.type === 'inflow' ? '▼' : '●'} 
							{signal.label}
						</span>
						<span class="hash">{formatHash(whale.hash)}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.info-legend {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		padding: 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 6px;
		margin-bottom: 1rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.55rem;
	}

	.legend-item.bullish { color: #22c55e; }
	.legend-item.bearish { color: #ef4444; }

	.macro-hint {
		grid-column: span 2;
		font-size: 0.5rem;
		color: #555;
		font-style: italic;
		background: rgba(0,0,0,0.2);
		padding: 4px 8px;
		border-radius: 4px;
		margin-top: 4px;
	}

	.whale-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.whale-card {
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		text-decoration: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		transition: all 0.2s;
	}

	.whale-card:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.15);
	}

	.card-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.coin-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.badge {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.amount {
		font-size: 0.9rem;
		font-weight: 600;
		color: #eee;
	}

	.time {
		font-size: 0.6rem;
		color: #666;
	}

	.mid {
		padding: 0.4rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.flow-text {
		font-size: 0.65rem;
		color: #999;
	}

	.f-from, .f-to {
		color: #bbb;
	}

	.f-arrow {
		margin: 0 0.2rem;
		color: #555;
	}

	.price-info {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.usd {
		font-size: 0.85rem;
		font-weight: 700;
		color: #fff;
	}

	.cny {
		font-size: 0.55rem;
		color: #666;
	}

	.signal-text {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.hash {
		font-size: 0.55rem;
		color: #444;
		font-family: monospace;
	}

	.empty-state {
		padding: 2rem;
		text-align: center;
		color: #666;
		font-size: 0.7rem;
	}
</style>
