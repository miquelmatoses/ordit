{% macro canon_beneficiari(col) %}
{#-
  Clau canonica de beneficiari (heuristica, precision-first). FEGA no porta CIF, aixi que la
  identitat depen del nom; esta clau plega variants de forma de la MATEIXA entitat (espais,
  puntuacio i forma juridica) sense fusionar-ne de distintes. Davant del dubte, NO fusiona.
  Vegeu docs/sources/fega.md per a les regles i les limitacions.

  Passos:
    1. majuscules + plega accents (strip_accents): "Société"/"SOCIETE" -> "SOCIETE".
    2. tot allo no alfanumeric -> espai (punts, comes, guions, &, parentesis...).
    3. col.lapsa espais (amb farciment d'un espai als extrems per als limits de paraula).
    4. canonicalitza formes juridiques freqüents, les mes llargues primer perque "S L U"
       no es trenque com a "SL U". Es mante la forma (NO s'elimina): "FOO SL" i "FOO SA"
       queden distints (precision-first; podrien ser entitats diferents).
    5. trim + col.lapsa final.

  Limitacio coneguda: dues formes juridiques seguides (rar) poden no plegar-se totes dues en
  una sola passada. Es tolera (heuristic; under-collapse es segur).
-#}
{%- set forms = [
    ['S C C L', 'SCCL'],
    ['S COOP V', 'SCV'],
    ['S C V', 'SCV'],
    ['S L U', 'SLU'],
    ['S A U', 'SAU'],
    ['S L L', 'SLL'],
    ['S A T', 'SAT'],
    ['C B', 'CB'],
    ['S L', 'SL'],
    ['S A', 'SA']
] -%}
{%- set base -%}
regexp_replace(regexp_replace(' ' || upper(strip_accents({{ col }})) || ' ', '[^A-Z0-9]', ' ', 'g'), '\s+', ' ', 'g')
{%- endset -%}
{%- set ns = namespace(expr = base) -%}
{%- for f in forms -%}
{%- set ns.expr = "regexp_replace(" ~ ns.expr ~ ", ' " ~ f[0] ~ " ', ' " ~ f[1] ~ " ', 'g')" -%}
{%- endfor -%}
nullif(trim(regexp_replace({{ ns.expr }}, '\s+', ' ', 'g')), '')
{% endmacro %}
