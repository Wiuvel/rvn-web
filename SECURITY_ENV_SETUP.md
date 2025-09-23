# Security Environment Variables Setup

## Server-Only Variables (Not exposed to client)

Add these to your `.env.local` file for local development:

```env
# Database Configuration (Server-only)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Security Configuration
CSRF_SECRET=your-super-secret-csrf-key-here-min-32-chars
SESSION_SECRET=your-super-secret-session-key-here-min-32-chars

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## Production Environment Variables

For production deployment (CapRover, Docker, etc.), set these environment variables:

### Required Variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `CSRF_SECRET` - Random 32+ character string for CSRF protection
- `SESSION_SECRET` - Random 32+ character string for session management

### Optional Variables:
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins for CORS
- `NODE_ENV` - Set to "production" for production deployment

## Security Best Practices

### 1. Generate Strong Secrets
```bash
# Generate CSRF secret
openssl rand -hex 32

# Generate session secret
openssl rand -hex 32
```

### 2. Environment Variable Security
- Never commit `.env.local` to version control
- Use different secrets for development and production
- Rotate secrets regularly
- Use environment-specific configuration

### 3. Supabase Security
- Use Row Level Security (RLS) policies
- Limit service role key access
- Monitor database access logs
- Use SSL/TLS connections only

### 4. Production Deployment
- Set `NODE_ENV=production`
- Use HTTPS only
- Configure proper CORS origins
- Enable security headers
- Monitor logs for suspicious activity

## Docker Configuration

Update your `dockerfile` to include these environment variables:

```dockerfile
# Add these ARG declarations
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG CSRF_SECRET
ARG SESSION_SECRET
ARG ALLOWED_ORIGINS

# Add these ENV declarations
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV CSRF_SECRET=$CSRF_SECRET
ENV SESSION_SECRET=$SESSION_SECRET
ENV ALLOWED_ORIGINS=$ALLOWED_ORIGINS
```

## CapRover Configuration

In your CapRover app settings, add these environment variables:

1. Go to your app → App Configs → Environment Variables
2. Add each variable with its value
3. Make sure to use the server-only variable names (without `NEXT_PUBLIC_`)

## Security Checklist

- [ ] All sensitive variables are server-only
- [ ] Strong secrets are generated and used
- [ ] Environment variables are not exposed in client code
- [ ] CORS is properly configured
- [ ] SSL/TLS is enabled in production
- [ ] Logs are sanitized and don't contain sensitive data
- [ ] Rate limiting is configured
- [ ] CSRF protection is enabled
- [ ] Session management is secure
- [ ] Database connections are encrypted
