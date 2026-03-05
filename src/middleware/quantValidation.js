/**
 * Input validation middleware for quantitative trading routes
 */
const express = require('express');

// Validation rules for different request types
const validateDepositRequest = (req, res, next) => {
    const { gateway, amount } = req.body;

    // Validate gateway
    if (!gateway || !['FUTU', 'OST'].includes(gateway.toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid gateway. Must be FUTU or OST.'
        });
    }

    // Validate amount
    if (amount === undefined || amount === null || typeof amount !== 'number' || amount <= 0 || amount > 10000000) {  // 10M max deposit
        return res.status(400).json({
            success: false,
            message: 'Invalid amount. Must be a positive number not exceeding 10,000,000.'
        });
    }

    next();
};

const validateOrderRequest = (req, res, next) => {
    const { gateway, symbol, direction, volume, price, orderType } = req.body;

    // Validate gateway
    if (!gateway || !['FUTU', 'OST'].includes(gateway.toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid gateway. Must be FUTU or OST.'
        });
    }

    // Validate symbol (basic validation - alphanumeric + some special characters)
    if (!symbol || !/^[A-Z][A-Z0-9]{0,9}$/.test(symbol)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid symbol format.'
        });
    }

    // Validate direction
    if (!direction || !['buy', 'sell'].includes(direction.toLowerCase())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid direction. Must be buy or sell.'
        });
    }

    // Validate volume
    if (volume === undefined || volume === null || typeof volume !== 'number' || volume <= 0 || volume > 1000000) {
        return res.status(400).json({
            success: false,
            message: 'Invalid volume. Must be a positive number not exceeding 1,000,000.'
        });
    }

    // Validate price
    if (typeof price !== 'number' || price < 0 || price > 10000) {
        return res.status(400).json({
            success: false,
            message: 'Invalid price. Must be a non-negative number not exceeding 10,000.'
        });
    }

    // Validate order type
    if (orderType && !['limit', 'market'].includes(orderType.toLowerCase())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid order type. Must be limit or market.'
        });
    }

    next();
};

const validateStrategyRequest = (req, res, next) => {
    const { name, gateway, symbols, params } = req.body;

    // Validate name
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 50) {
        return res.status(400).json({
            success: false,
            message: 'Invalid strategy name. Must be 2-50 characters.'
        });
    }

    // Validate gateway
    if (!gateway || !['FUTU', 'OST'].includes(gateway.toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid gateway. Must be FUTU or OST.'
        });
    }

    // Validate symbols
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0 || symbols.length > 10) {
        return res.status(400).json({
            success: false,
            message: 'Invalid symbols. Must be an array with 1-10 symbols.'
        });
    }

    for (const symbol of symbols) {
        if (!/^[A-Z][A-Z0-9]{0,9}$/.test(symbol)) {
            return res.status(400).json({
                success: false,
                message: `Invalid symbol format: ${symbol}`
            });
        }
    }

    // Validate params if present
    if (params && typeof params === 'object') {
        if (params.stop_loss && (typeof params.stop_loss !== 'number' || params.stop_loss < 0 || params.stop_loss > 1)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid stop_loss. Must be a number between 0 and 1.'
            });
        }
    }

    next();
};

// Validation for path parameters
const validateGatewayParam = (req, res, next) => {
    const gateway = req.params.gateway;

    if (!gateway || !['FUTU', 'OST'].includes(gateway.toUpperCase())) {
        return res.status(400).json({
            success: false,
            message: 'Invalid gateway parameter. Must be FUTU or OST.'
        });
    }

    next();
};

const validateOrderIdParam = (req, res, next) => {
    const orderId = req.params.orderId;

    // Basic validation for order ID format (adjust as needed based on your system)
    if (!orderId || typeof orderId !== 'string' || orderId.length < 1 || orderId.length > 50) {
        return res.status(400).json({
            success: false,
            message: 'Invalid order ID parameter.'
        });
    }

    next();
};

const validateStrategyNameParam = (req, res, next) => {
    const name = req.params.name;

    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 50) {
        return res.status(400).json({
            success: false,
            message: 'Invalid strategy name parameter.'
        });
    }

    next();
};

module.exports = {
    validateDepositRequest,
    validateOrderRequest,
    validateStrategyRequest,
    validateGatewayParam,
    validateOrderIdParam,
    validateStrategyNameParam
};