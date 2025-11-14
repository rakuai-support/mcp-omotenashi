# Nginx configuration for MCP Server
# mcp.omotenashiqr.com

# HTTP server (will be redirected to HTTPS after SSL setup)
server {
    listen 80;
    listen [::]:80;
    server_name mcp.omotenashiqr.com;

    # Allow Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all other traffic to HTTPS (after SSL setup)
    # Uncomment after running: sudo certbot --nginx -d mcp.omotenashiqr.com
    # return 301 https://$server_name$request_uri;

    # Temporary proxy to MCP server (before SSL setup)
    location / {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;

        # WebSocket/SSE support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for long-running requests
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;

        # Disable buffering for SSE
        proxy_buffering off;
        proxy_cache off;
    }
}

# HTTPS server (will be configured by certbot)
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name mcp.omotenashiqr.com;
#
#     # SSL certificates (managed by certbot)
#     # ssl_certificate /etc/letsencrypt/live/mcp.omotenashiqr.com/fullchain.pem;
#     # ssl_certificate_key /etc/letsencrypt/live/mcp.omotenashiqr.com/privkey.pem;
#     # include /etc/letsencrypt/options-ssl-nginx.conf;
#     # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
#
#     location / {
#         proxy_pass http://localhost:8001;
#         proxy_http_version 1.1;
#
#         # WebSocket/SSE support
#         proxy_set_header Upgrade $http_upgrade;
#         proxy_set_header Connection "upgrade";
#
#         # Standard proxy headers
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#
#         # Timeouts for long-running requests
#         proxy_read_timeout 300;
#         proxy_connect_timeout 300;
#         proxy_send_timeout 300;
#
#         # Disable buffering for SSE
#         proxy_buffering off;
#         proxy_cache off;
#     }
#
#     # Security headers
#     add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
#     add_header X-Frame-Options "SAMEORIGIN" always;
#     add_header X-Content-Type-Options "nosniff" always;
#     add_header X-XSS-Protection "1; mode=block" always;
# }
