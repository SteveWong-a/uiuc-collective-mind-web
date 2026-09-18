import urllib.parse

svg_data = urllib.parse.unquote("%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 fill=%27%23000%27/%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%278%27 fill=%27none%27 stroke=%27%23fff%27 stroke-width=%273%27/%3E%3C/svg%3E")

with open('assets/icon.svg', 'w') as f:
    f.write(svg_data)
