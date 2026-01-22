FROM mitmproxy/mitmproxy:10.1.1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY addon.py .

EXPOSE 8080

CMD ["mitmdump", "-s", "/app/addon.py", "--listen-host", "0.0.0.0", "--listen-port", "8080", "--set", "block_global=false"]
