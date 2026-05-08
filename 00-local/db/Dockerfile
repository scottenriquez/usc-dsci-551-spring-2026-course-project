FROM yugabytedb/yugabyte:2024.2.4.0-b89

RUN ln -s /usr/local/bin/ysqlsh /usr/local/bin/psql
RUN mkdir -p /var/log/app
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh
WORKDIR /home/yugabyte
EXPOSE 5433 7000 9000 15433
ENTRYPOINT ["/usr/local/bin/start.sh"]
