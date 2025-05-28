# NOC Data 2025 - Seeding Application

A robust Node.js application for seeding National Occupational Classification (NOC) data with VIU programs and employment outlooks into a PostgreSQL database using Prisma ORM.

## 🚀 Features

- **Modular Architecture**: Well-organized codebase with separation of concerns
- **Intelligent Database Checking**: Automatically detects existing records and uses counts as skip values to prevent duplicates
- **Robust Error Handling**: Comprehensive error handling with retry logic and graceful degradation
- **Professional Logging**: Winston-based logging with file rotation and structured logs
- **Environment Configuration**: Centralized configuration management with validation
- **Database Optimization**: Supabase-optimized with connection pooling and rate limiting
- **Progress Tracking**: Real-time progress monitoring with resume capability
- **Code Quality**: ESLint and Prettier integration for consistent code style
- **Batch Processing**: Efficient parallel batch processing with transaction support
- **Health Monitoring**: Database health checks and performance metrics

## 📋 Prerequisites

- Node.js >= 16.0.0
- npm >= 8.0.0
- PostgreSQL database (Supabase recommended)
- Environment variables configured (see [Configuration](#configuration))

## 🛠️ Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/rogadev/NOC-data-2025.git
   cd NOC-data-2025
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Generate Prisma client**

   ```bash
   npm run db:generate
   ```

5. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

## 🔄 Automatic Resume Functionality

The application now features **intelligent resume capability** that automatically detects existing records in your database and calculates where to resume seeding operations. This eliminates the need to manually set skip counts or worry about duplicate records.

### How It Works

1. **Database Analysis**: Before starting any seeding operation, the application counts existing records in each table
2. **Smart Calculation**: Compares existing records with source data to determine optimal resume positions
3. **Automatic Skip**: Automatically skips already-processed records and resumes from where it left off
4. **Progress Display**: Shows exactly what will be skipped and what will be processed

### Benefits

- **Zero Configuration**: No need to manually set `SKIP_*` environment variables
- **Fault Tolerant**: Safely resume after interruptions, crashes, or network issues
- **Efficient**: Skip processing of existing records to save time and resources
- **Transparent**: Clear logging shows exactly what's being skipped and why

### Example Output

```
🔍 Checking existing database records for smart resume...
📊 Current database record counts: {
  programAreas: 15,
  programs: 245,
  nocUnitGroups: 0,
  outlooks: 0,
  programNocLinks: 0
}
📍 Calculated resume positions:
   SKIP_PROGRAM_AREAS: Skip first 15 records
   SKIP_PROGRAMS: Skip first 245 records
   SKIP_NOC_UNIT_GROUPS: Start from beginning
   SKIP_OUTLOOKS: Start from beginning
   SKIP_PROGRAM_NOC_LINKS: Start from beginning

🔄 Resume mode activated - skipping existing records:
   PROGRAM AREAS: Skipping 15 records
   PROGRAMS: Skipping 245 records
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

#### Required Variables

```env
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"
DIRECT_URL="postgresql://username:password@localhost:5432/database_name"
```

#### Optional Variables (with defaults)

```env
# Application Environment
NODE_ENV="development"
LOG_LEVEL="info"

# Supabase Configuration
SUPABASE_PAID_TIER="false"

# Seeding Configuration
BATCH_SIZE="25"
PARALLEL_BATCHES="2"
TRANSACTION_BATCH_SIZE="50"
BATCH_DELAY_MS="100"

# Feature Flags
LOG_ERRORS="true"
ENABLE_PROGRESS_TRACKING="true"

# Seeding Control Flags (disable sections)
SEED_PROGRAM_AREAS="true"
SEED_PROGRAMS="true"
SEED_NOC_UNIT_GROUPS="true"
SEED_OUTLOOKS="true"
SEED_PROGRAM_NOC_LINKS="true"

# File Paths
PROGRESS_FILE="seeding-progress.json"
DATA_DIR="data"
```

### Configuration Validation

The application automatically validates configuration on startup and will throw descriptive errors for invalid settings.

## 🚀 Usage

### Basic Commands

```bash
# Start seeding process
npm start
# or
npm run seed

# Test database check functionality
npm run test-db-check

# Check database record counts
npm run count

# View query examples
npm run query

# Check seeding progress
npm run progress

# Database operations
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations
npm run db:reset       # Reset database
npm run db:studio      # Open Prisma Studio
```

### Code Quality Commands

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## 📁 Project Structure

```
NOC-data-2025/
├── src/
│   ├── config/
│   │   ├── index.js           # Main configuration
│   │   └── environment.js     # Environment variable management
│   ├── seeders/
│   │   ├── program-areas.js   # Program areas seeder
│   │   ├── programs.js        # Programs seeder
│   │   ├── noc-unit-groups.js # NOC unit groups seeder
│   │   ├── outlooks.js        # Employment outlooks seeder
│   │   └── program-noc-links.js # Program-NOC relationships
│   ├── utils/
│   │   ├── database.js        # Database utilities
│   │   ├── logger.js          # Logging utilities
│   │   ├── progress.js        # Progress tracking
│   │   ├── batch-processor.js # Batch processing
│   │   └── calculate-total.js # Record counting
│   └── seed.js                # Main orchestrator
├── scripts/
│   ├── count-records.js       # Record counting script
│   ├── query-examples.js      # Query examples
│   └── check-progress.js      # Progress checking
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── data/                      # Data files (JSON)
├── logs/                      # Application logs
├── .eslintrc.js              # ESLint configuration
├── .prettierrc.js            # Prettier configuration
├── env.example               # Environment variables template
└── README.md                 # This file
```

## 🔧 Architecture

### Core Components

1. **Configuration Management** (`src/config/`)

   - Environment variable validation and type conversion
   - Centralized configuration with defaults
   - Runtime configuration validation

2. **Database Layer** (`src/utils/database.js`)

   - Prisma client with optimized settings
   - Connection pooling and health checks
   - Retry logic and error categorization
   - Transaction management

3. **Logging System** (`src/utils/logger.js`)

   - Winston-based structured logging
   - File rotation and log levels
   - Specialized seeding operation logs
   - Error tracking and debugging

4. **Batch Processing** (`src/utils/batch-processor.js`)

   - Parallel batch processing
   - Rate limiting and connection management
   - Progress tracking and resume capability
   - Error handling and fallback strategies

5. **Seeders** (`src/seeders/`)
   - Modular seeding operations
   - Check-then-create approach
   - Dependency order management
   - Upsert operations for data integrity

### Design Patterns

- **Dependency Injection**: Configuration and utilities injected into modules
- **Error Handling**: Comprehensive error categorization and recovery
- **Observer Pattern**: Progress tracking and logging
- **Strategy Pattern**: Different processing strategies based on configuration
- **Factory Pattern**: Database connection and client management

## 📊 Performance Optimization

### Database Optimizations

- Connection pooling with configurable limits
- Batch processing with transaction support
- Query optimization and slow query detection
- Rate limiting for free tier compatibility

### Memory Management

- Streaming data processing for large datasets
- Garbage collection friendly batch sizes
- Progress tracking with minimal memory footprint

### Monitoring

- Real-time progress tracking
- Performance metrics and timing
- Health checks and status monitoring
- Detailed logging for debugging

## 🔍 Troubleshooting

### Common Issues

1. **Database Connection Errors**

   - Verify `DATABASE_URL` is correct
   - Check network connectivity
   - Ensure database is running

2. **Rate Limiting**

   - Reduce `BATCH_SIZE` and `PARALLEL_BATCHES`
   - Increase `BATCH_DELAY_MS`
   - Set `SUPABASE_PAID_TIER=false` for free tier

3. **Memory Issues**

   - Reduce batch sizes
   - Check available system memory
   - Monitor log files for memory warnings

4. **Resume Capability**
   - Resume functionality is now automatic based on existing database records
   - Check `seeding-progress.json` for current state
   - Review logs for last successful operation
   - Use `SEED_*=false` environment variables to skip entire sections if needed

### Debugging

1. **Enable Debug Logging**

   ```env
   LOG_LEVEL="debug"
   ```

2. **Check Log Files**

   ```bash
   tail -f logs/combined.log
   tail -f logs/error.log
   ```

3. **Database Health Check**
   ```bash
   npm run count
   ```

## 🧪 Testing

### Manual Testing

```bash
# Test database connection
npm run count

# Test with small dataset
BATCH_SIZE=5 PARALLEL_BATCHES=1 npm start

# Test with specific sections disabled
SEED_OUTLOOKS=false npm start
```

### Code Quality Checks

```bash
# Run all quality checks
npm run lint && npm run format:check
```

## 📈 Monitoring and Metrics

### Progress Tracking

- Real-time progress indicators
- Percentage completion
- Processing rate (records/second)
- Estimated time remaining

### Performance Metrics

- Batch processing times
- Database response times
- Error rates and types
- Memory usage patterns

### Logging

- Structured JSON logs for analysis
- Error categorization and tracking
- Performance monitoring
- Audit trail for operations

## 🤝 Contributing

1. **Code Style**

   - Follow ESLint and Prettier configurations
   - Use meaningful variable and function names
   - Add JSDoc comments for functions
   - Write descriptive commit messages

2. **Testing**

   - Test with different batch sizes
   - Verify error handling scenarios
   - Check resume capability
   - Validate configuration changes

3. **Documentation**
   - Update README for new features
   - Add inline comments for complex logic
   - Document configuration changes
   - Include examples for new functionality

## 📄 License

ISC License - see LICENSE file for details.

## 🔗 Related Documentation

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Supabase Documentation](https://supabase.com/docs)
- [Winston Logging](https://github.com/winstonjs/winston)
- [ESLint Configuration](https://eslint.org/docs/user-guide/configuring/)

## 📞 Support

For issues and questions:

1. Check the [troubleshooting section](#troubleshooting)
2. Review log files in the `logs/` directory
3. Open an issue on GitHub with detailed information

---

**Note**: This application is optimized for Supabase free tier but can be configured for paid tiers or other PostgreSQL providers by adjusting the configuration parameters.
