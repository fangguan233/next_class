#!/bin/bash
# 生成新的DNS验证token
NEW_TOKEN=$(openssl rand -hex 32)
echo $NEW_TOKEN > dns-token.txt
echo "请更新DNS TXT记录为：$NEW_TOKEN"
read -p "更新完成后按回车继续..."
