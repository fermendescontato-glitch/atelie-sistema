# Como publicar no GitHub Pages

## 1. Criar o repositório (só na primeira vez)

1. No GitHub: **New repository**.
2. Nome sugerido: `atelie-sistema`.
3. Marque **Public**. O GitHub Pages gratuito exige repositório público. O código fica visível, mas os dados continuam protegidos pelo Supabase.
4. Clique em **Create repository**.

## 2. Subir os arquivos

1. No repositório: **Add file** > **Upload files**.
2. Arraste **o conteúdo** da pasta `nodana-sistema`, mantendo as subpastas:

```
index.html
assets/app.js
assets/config.js
assets/styles.css
vendor/supabase.js
docs/...
supabase/...
```

3. Clique em **Commit changes**.

> O `index.html` precisa ficar na raiz, e não dentro de outra pasta.

## 3. Ligar o GitHub Pages

1. **Settings** > **Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Escolha a branch **main** e a pasta **/ (root)**. Depois clique em **Save**.
4. Espere 1 ou 2 minutos. O endereço aparece no topo da página, no formato `https://SEU-USUARIO.github.io/atelie-sistema/`.

## 4. Avisar o Supabase do endereço

1. No Supabase, vá em **Authentication** > **URL Configuration**.
2. Em **Site URL**, coloque o endereço do GitHub Pages.
3. Salve.

## 5. Testar

Abra o endereço e entre com a sua usuária. Depois:

1. Preencha as **Configurações** e salve.
2. Envie um logo.
3. Cadastre um material na **Biblioteca**.
4. Cadastre um cliente.

Se algo der erro, mande um print da mensagem.

## Atualizações

Quando eu mandar uma versão nova, suba de novo só os arquivos que mudaram, pelo **Upload files**, e confirme a substituição. Para garantir que a versão nova carregou, a versão aparece no rodapé do menu.
