# 純靜態網站，直接用 nginx 提供服務
FROM nginx:alpine

# 複製靜態檔案
COPY . /usr/share/nginx/html

# 複製 nginx 設定
COPY nginx.conf /etc/nginx/nginx.conf

# Cloud Run 預設使用 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
