<script lang="ts">
	import { Panel } from '$lib/components/common';
	import { crypto } from '$lib/stores';
	import { formatCurrency, formatPercentChange, getChangeClass } from '$lib/utils';

	const items = $derived($crypto.items);
	const loading = $derived($crypto.loading);
	const error = $derived($crypto.error);
	const count = $derived(items.length);
</script>

<Panel id="whales" title="加密货币动态" {count} {loading} {error}>
	{#if items.length === 0 && !loading && !error}
		<div class="empty-state">暂无加密货币数据</div>
	{:else}
		<div class="crypto-list">
			{#each items as coin (coin.id)}
				{@const changeClass = getChangeClass(coin.price_change_percentage_24h)}
				<a
					href="https://coinmarketcap.com/currencies/{coin.id}"
					target="_blank"
					rel="noopener noreferrer"
					class="crypto-item"
				>
					<div class="crypto-info">
						<div class="crypto-name">{coin.name}</div>
						<div class="crypto-symbol">{coin.symbol.toUpperCase()}</div>
					</div>
					<div class="crypto-data">
						<div class="crypto-price">{formatCurrency(coin.current_price)}</div>
						<div class="crypto-change {changeClass}">
							{formatPercentChange(coin.price_change_percentage_24h)}
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.crypto-list {
		display: flex;
		flex-direction: column;
	}

	.crypto-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
		text-decoration: none;
		transition: background-color 0.2s;
	}

	.crypto-item:hover {
		background-color: rgba(255, 255, 255, 0.05);
	}

	.crypto-item:last-child {
		border-bottom: none;
	}

	.crypto-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.crypto-name {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.crypto-symbol {
		font-size: 0.55rem;
		color: var(--text-muted);
	}

	.crypto-data {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.1rem;
	}

	.crypto-price {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}

	.crypto-change {
		font-size: 0.6rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.crypto-change.up {
		color: var(--success);
	}

	.crypto-change.down {
		color: var(--danger);
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>
