# Supabase Seeding Configuration Guide

## Environment Variables

Set these environment variables to optimize seeding for your Supabase tier:

```bash
# Required: Your Supabase database URLs
DATABASE_URL="postgresql://username:password@host:port/database"
DIRECT_URL="postgresql://username:password@host:port/database"

# Optional: Set to 'true' if you're on a paid Supabase plan
SUPABASE_PAID_TIER=false
```

## Tier-Specific Optimizations

### Free Tier (Default Settings)

- **Batch Size**: 50 records per batch
- **Parallel Batches**: 2 concurrent operations
- **Batch Delay**: 150ms between batch groups
- **Transaction Batch Size**: 100 operations per transaction

### Paid Tier Settings

Set `SUPABASE_PAID_TIER=true` to enable:

- Higher parallel batch limits
- Reduced delays between operations
- Better connection pooling utilization

## Rate Limit Guidelines

### Supabase Free Tier Limits

- **Concurrent Connections**: 2-5
- **Request Rate**: 60 requests/second burst limit
- **Recommended Parallel Batches**: 1-3

### Supabase Paid Tier Limits

- **Concurrent Connections**: Much higher (plan dependent)
- **Request Rate**: Significantly higher
- **Recommended Parallel Batches**: 5-10+

## Monitoring Performance

The seeding script provides real-time metrics:

- Progress percentage for each operation
- Records created vs skipped
- Average batch processing time
- Effective rate limit usage percentage

## Troubleshooting

### Common Issues

1. **"Too many connections" errors**

   - Reduce `PARALLEL_BATCHES` to 1-2
   - Increase `BATCH_DELAY_MS` to 200-300ms

2. **Rate limit errors**

   - Increase `BATCH_DELAY_MS`
   - Reduce `BATCH_SIZE`
   - Ensure `SUPABASE_PAID_TIER` is set correctly

3. **Transaction timeouts**
   - Reduce `TRANSACTION_BATCH_SIZE`
   - Some operations automatically disable transactions for complex queries

### Performance Tips

1. **For Large Datasets**: Consider using Supabase's HTTP REST API or RPC functions for bulk operations
2. **Connection Management**: The script automatically manages Prisma client connections
3. **Error Recovery**: Failed operations are logged and skipped to continue processing
4. **Progress Tracking**: Monitor the percentage completion and rate metrics

## Advanced Configuration

You can modify the constants in `seed.js` for fine-tuning:

```javascript
const BATCH_SIZE = 50 // Records per batch
const PARALLEL_BATCHES = 2 // Concurrent batch operations
const BATCH_DELAY_MS = 150 // Delay between batch groups
const TRANSACTION_BATCH_SIZE = 100 // Max operations per transaction
```

## Best Practices

1. **Start Conservative**: Begin with default settings and increase gradually
2. **Monitor Logs**: Watch for rate limit warnings in the console
3. **Use Transactions**: Enabled for simple create operations to improve atomicity
4. **Batch Related Data**: Complex operations (like NOC sections) are processed in smaller sub-batches
5. **Connection Cleanup**: The script properly disconnects from Prisma at completion
