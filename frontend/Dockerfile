# Use a lightweight base image
FROM nginx:alpine

# Copy the frontend application files from the dist directory to the Nginx server
COPY dist/ /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"] 