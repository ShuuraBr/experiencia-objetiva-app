# Experiencia Objetiva

Aplicacao web para operacionalizar o programa corporativo de avaliacao da experiencia do cliente descrito no documento enviado.

## O que esta pronto

- formulario publico com escala de 1 a 5
- dimensoes complementares do atendimento
- comentario opcional
- anonimato preferencial com campo opcional de identificacao
- criacao de pontos de coleta por unidade, etapa da jornada e canal
- link individual e QR code para cada ponto
- persistencia local em SQLite e persistencia de producao em MySQL
- painel gerencial com medias, volume, comentarios e exportacao CSV

## Como executar localmente

1. Abra um terminal na pasta do projeto.
2. Copie `.env.example` para `.env`.
3. Instale as dependencias:

```bash
npm install
```

4. Inicie a aplicacao:

```bash
npm start
```

5. Acesse:

- `http://localhost:3000/` para a pagina inicial
- `http://localhost:3000/gestao` para o painel administrativo

## Banco de dados

### Desenvolvimento local

Use `DB_CLIENT=sqlite`. O arquivo do banco sera criado automaticamente em `data/experiencia-objetiva.sqlite`.

### Producao na Hostinger

Use `DB_CLIENT=mysql` e configure as variaveis:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

Ou, se preferir, defina apenas `DATABASE_URL` no formato:

```bash
DATABASE_URL=mysql://usuario:senha@host:3306/banco
```

As tabelas sao criadas automaticamente na primeira inicializacao da aplicacao.

## Publicacao no Git

O projeto esta pronto para versionamento com:

- `.gitignore` ignorando `node_modules`, `.env` e bancos locais
- `package-lock.json` para deploy reprodutivel
- variaveis de ambiente separadas da aplicacao

Fluxo sugerido:

```bash
git init
git add .
git commit -m "feat: experiencia objetiva app"
git branch -M main
git remote add origin <url-do-repositorio>
git push -u origin main
```

## Deploy na Hostinger

Fluxo recomendado:

1. Criar um repositorio GitHub para este projeto.
2. No hPanel, adicionar um novo website do tipo Node.js web app.
3. Escolher `Import Git Repository`.
4. Selecionar o repositorio e a branch `main`.
5. Confirmar Node.js `20.x`, `22.x` ou `24.x`.
6. Definir as variaveis de ambiente do MySQL e `PUBLIC_BASE_URL`.
7. Publicar e, depois, conectar o dominio final.

## Diagnostico rapido de 503

Se o app cair com `503` na Hostinger, confira nesta ordem:

1. `Deployments -> Runtime logs` e `Build logs`.
2. `Settings & Redeploy -> Environment Variables` para validar `DB_CLIENT=mysql`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` e `PUBLIC_BASE_URL`.
3. `Databases -> MySQL Databases` para confirmar se o banco e o usuario existem.
4. `Websites -> Dashboard -> Resources Usage` para ver se CPU, RAM, processos, IO ou inodes atingiram limite.
5. Abra `/health` no dominio da aplicacao para verificar se o processo subiu e se o banco foi conectado.

Se `/health` responder com `databaseError`, o problema tende a estar na configuracao do MySQL.

## Estrutura

- `src/server.js`: rotas HTTP, public URL e geracao do QR code
- `src/db.js`: adaptadores SQLite/MySQL, schema e consultas analiticas
- `src/utils.js`: utilitarios de slug, datas e CSV
- `public/`: telas da aplicacao
- `.env.example`: configuracao base para local e producao

## Evolucoes sugeridas

- autenticacao para o painel administrativo
- filtros por periodo e unidade
- dashboards com metas mensais
- integracao com WhatsApp e CRM
- notificacoes para notas baixas
