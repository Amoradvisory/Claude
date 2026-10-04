#!/usr/bin/env python3
"""Construit tous les livrables à partir de donnees/resultats.json (source de vérité).

Produit (sans écraser l'historique) :
  - prix_observes.csv          : ajout des nouvelles observations (les recherches précédentes ne sont jamais modifiées)
  - donnees/aeroports.csv      : cartographie des aéroports
  - RESULTAT.md                : résultat le plus récent (l'ancien est archivé dans historique/)
  - historique/<date>_recherche.md : instantané daté de cette recherche
  - Vols_Tunis_Octobre_2026.html   : livrable visuel autonome

Le PDF est produit ensuite par outils/generer_pdf.mjs à partir du HTML.
Usage : python3 outils/construire.py
"""
import csv
import datetime as dt
import hashlib
import html
import json
import os
import re
import shutil
import urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(BASE, "donnees", "resultats.json")

with open(SOURCE, encoding="utf-8") as f:
    D = json.load(f)

META = D["meta"]
OFFRES = D["offres"]
REFS = D["references_sans_dates"]


def eligible(o):
    """Règle de classement : prix final connu, bagage en soute >= 20 kg garanti, aéroport dans
    le rayon, statut VÉRIFIÉ ou OBSERVÉ (jamais ESTIMÉ), aller et retour dans la période."""
    return (o.get("prix_final") is not None and o.get("bagage_20kg_garanti")
            and o["distance_km"] <= META["rayon_km"] and o["statut"] in ("VÉRIFIÉ", "OBSERVÉ")
            and META["periode_debut"] <= o["date_aller"] < o["date_retour"] <= META["periode_fin"])


CLASSEES = sorted(filter(eligible, OFFRES), key=lambda o: (o["prix_final"], -o["nuits"], o["date_aller"]))
for _o in OFFRES:
    _o["rang"], _o["dans_top3"] = None, False
for _i, _o in enumerate(CLASSEES, 1):
    _o["rang"], _o["dans_top3"] = _i, _i <= 3
TOP3 = CLASSEES[:3]
N1 = TOP3[0]
MEME_VOL_TOP3 = len({(o["code"], o["compagnie"], o["type"]) for o in TOP3}) == 1


def phrase_meilleurs():
    """« Meilleur vol direct » et « meilleur départ de Bruxelles », calculés sur le classement."""
    direct = next((o for o in CLASSEES if o["type"] == "DIRECT"), None)
    bru = next((o for o in CLASSEES if o["code"] == "BRU"), None)
    morceaux = []
    for nom, o in (("Meilleur vol direct", direct), ("Meilleur départ de Bruxelles", bru)):
        if o is None:
            morceaux.append(f"{nom} : aucun parmi les offres classées.")
        else:
            morceaux.append(f"{nom} : n°{o['rang']} ({euros(o['prix_final'])}).")
    if MEME_VOL_TOP3:
        morceaux.append(f"Les trois premières offres sont des vols {N1['type'].lower()}s {N1['compagnie']} "
                        f"au départ de {N1['aeroport']}.")
    return " ".join(morceaux)
META["offres_examinees"] = len(OFFRES) + len(REFS)

NBSP = "\u00a0"
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
JOURS_COURTS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]
MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août",
               "sept.", "oct.", "nov.", "déc."]


# ---------------------------------------------------------------- utilitaires
def jour(iso):
    return dt.date.fromisoformat(iso)


def date_longue(iso):
    d = jour(iso)
    return f"{JOURS[d.weekday()]} {d.day} {MOIS[d.month - 1]} {d.year}"


def date_courte(iso, annee=False):
    d = jour(iso)
    txt = f"{JOURS_COURTS[d.weekday()]} {d.day}{NBSP}{MOIS_COURTS[d.month - 1]}"
    return txt + (f" {d.year}" if annee else "")


def date_fr(iso):
    d = jour(iso)
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def euros(n):
    if n is None:
        return "inconnu"
    return f"{int(n):,}".replace(",", NBSP) + NBSP + "€"


def ecart(n, ref):
    diff = n - ref
    if diff == 0:
        return "même prix"
    return ("+" if diff > 0 else "−") + euros(abs(diff))


def nuits_txt(n):
    return f"{n} nuit" + ("s" if n > 1 else "")


def e(txt):
    """Échappe pour le HTML et applique les espaces insécables français (12 €, 2 h 35)."""
    t = re.sub(r"(\d) (€|\$|£|kg|km|nuits?)\b", "\\1" + NBSP + "\\2", str(txt))
    t = re.sub(r"(\d) €", "\\1" + NBSP + "€", t)
    t = re.sub(r"(\d) h (\d)", "\\1" + NBSP + "h" + NBSP + "\\2", t)
    return html.escape(t, quote=True)


def lien_google(o):
    q = f"Flights from {o['code']} to TUN on {o['date_aller']} through {o['date_retour']}"
    if o["type"] == "DIRECT":
        q += " nonstop"
    return "https://www.google.com/travel/flights?" + urllib.parse.urlencode(
        {"q": q, "hl": "fr", "gl": "BE", "curr": "EUR"})


def lien_skyscanner(o):
    a = jour(o["date_aller"]).strftime("%y%m%d")
    r = jour(o["date_retour"]).strftime("%y%m%d")
    return (f"https://www.skyscanner.fr/transport/vols/{o['code'].lower()}/tun/{a}/{r}/"
            "?adultsv2=1&cabinclass=economy&rtn=1&preferdirects=true")


def lien_kayak(o):
    url = f"https://www.kayak.fr/flights/{o['code']}-TUN/{o['date_aller']}/{o['date_retour']}?sort=price_a"
    return url + ("&fs=stops=0" if o["type"] == "DIRECT" else "")


def lien_momondo(o):
    url = f"https://www.momondo.fr/flight-search/{o['code']}-TUN/{o['date_aller']}/{o['date_retour']}?sort=price_a"
    return url + ("&fs=stops=0" if o["type"] == "DIRECT" else "")


SITES_CIE = {
    "Tunisair": ("tunisair.com", "https://www.tunisair.com/fr"),
    "Nouvelair": ("nouvelair.com", "https://www.nouvelair.com/fr"),
    "Transavia France": ("transavia.com", "https://www.transavia.com/fr-FR/accueil/"),
}


def site_cie(o):
    return SITES_CIE.get(o["compagnie"], ("site de la compagnie", lien_google(o)))


def ecrire(chemin, contenu):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8", newline="\n") as f:
        f.write(contenu)


def chemin_libre(chemin):
    """Renvoie un chemin qui n'existe pas encore (suffixe _v2, _v3...)."""
    if not os.path.exists(chemin):
        return chemin
    racine, ext = os.path.splitext(chemin)
    i = 2
    while os.path.exists(f"{racine}_v{i}{ext}"):
        i += 1
    return f"{racine}_v{i}{ext}"


# ---------------------------------------------------------------- CSV (ajout seulement)
COLONNES = ["date_recherche", "heure_recherche", "recherche_id", "offre_id", "aeroport_depart",
            "code_aeroport", "date_aller", "date_retour", "nombre_nuits", "compagnie",
            "direct_ou_escale", "vendeur", "prix_initial", "prix_bagage", "frais", "prix_final",
            "devise_origine", "prix_origine", "type_bagage", "source", "url",
            "date_collecte_source", "statut_verification", "rang", "notes"]


def ligne_csv(o):
    return {
        "date_recherche": META["date_recherche"],
        "heure_recherche": o["observe_le"].split(" ", 1)[1],
        "recherche_id": META["recherche_id"],
        "offre_id": o["id"],
        "aeroport_depart": o["aeroport"],
        "code_aeroport": o["code"],
        "date_aller": o["date_aller"],
        "date_retour": o["date_retour"],
        "nombre_nuits": o["nuits"],
        "compagnie": o["compagnie"],
        "direct_ou_escale": o["type"],
        "vendeur": o["vendeur"],
        "prix_initial": "" if o["prix_initial"] is None else o["prix_initial"],
        "prix_bagage": "" if o["prix_bagage"] is None else o["prix_bagage"],
        "frais": "" if o["frais"] is None else o["frais"],
        "prix_final": "" if o["prix_final"] is None else o["prix_final"],
        "devise_origine": o["devise_origine"],
        "prix_origine": "" if o["prix_origine"] is None else o["prix_origine"],
        "type_bagage": o["bagage"],
        "source": o["source"],
        "url": o["url_source"],
        "date_collecte_source": o["collecte_source"],
        "statut_verification": o["statut"] + (" / " + o["badge"] if o.get("badge") else ""),
        "rang": "" if o.get("rang") is None else o["rang"],
        "notes": o["observations"],
    }


def ligne_csv_ref(i, r):
    return {
        "date_recherche": META["date_recherche"], "heure_recherche": "≈12:45",
        "recherche_id": META["recherche_id"], "offre_id": f"REF-{i:02d}",
        "aeroport_depart": r["route"].split(" → ")[0], "code_aeroport": r["route"].split(" → ")[0],
        "date_aller": "", "date_retour": "", "nombre_nuits": "", "compagnie": r["compagnie"],
        "direct_ou_escale": "", "vendeur": "", "prix_initial": "", "prix_bagage": "", "frais": "",
        "prix_final": "", "devise_origine": "", "prix_origine": r["prix"], "type_bagage": r["bagage"],
        "source": "résumé de recherche", "url": r["url"], "date_collecte_source": "inconnue",
        "statut_verification": r["statut"], "rang": "", "notes": r["note"],
    }


def maj_csv():
    """Les lignes des recherches précédentes sont conservées telles quelles ;
    seules les lignes de la recherche en cours (même recherche_id) sont réécrites."""
    chemin = os.path.join(BASE, "prix_observes.csv")
    anciennes = []
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8-sig", newline="") as f:
            anciennes = [row for row in csv.DictReader(f, delimiter=";")
                         if row["recherche_id"] != META["recherche_id"]]
    lignes = [ligne_csv(o) for o in OFFRES] + [ligne_csv_ref(i, r) for i, r in enumerate(REFS, 1)]
    with open(chemin, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLONNES, delimiter=";", quoting=csv.QUOTE_MINIMAL,
                           extrasaction="ignore")
        w.writeheader()
        w.writerows(anciennes)
        w.writerows(lignes)
    return len(lignes), len(anciennes)


def ecrire_aeroports():
    chemin = os.path.join(BASE, "donnees", "aeroports.csv")
    with open(chemin, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["code_iata", "nom", "distance_km_depuis_lille", "vol_direct_tun",
                    "compagnies", "jours_exploitation_constates", "statut", "pertinent"])
        for a in D["aeroports"]:
            w.writerow([a["code"], a["nom"], a["distance_km"], a["direct_tun"], a["compagnies"],
                        a["jours"], a["statut"], "oui" if a["pertinent"] else "non"])
        for a in D["hors_rayon"]:
            w.writerow([a["code"], a["nom"], a["distance_km"], "voir constat", "", a["constat"],
                        "hors rayon", "exception étudiée"])


# ---------------------------------------------------------------- Markdown
def bloc_md(o, titre):
    nom_site, url_site = site_cie(o)
    return f"""==============================
{titre}
==============================

Prix final :
{euros(o['prix_final'])} — {o['statut']} · {o['badge']} (non vérifié dans un parcours de réservation)

Aller :
{date_longue(o['date_aller'])}

Retour :
{date_longue(o['date_retour'])}

Durée du séjour :
{nuits_txt(o['nuits'])}

Départ :
{o['aeroport']} ({o['code']}) — {o['distance_km']} km de Lille

Arrivée :
Tunis-Carthage TUN

Compagnie :
{o['compagnie']} ({o['vols']})

Vol :
{o['type'].lower()}

Horaire aller :
{o['horaire_aller']}

Horaire retour :
{o['horaire_retour']}

Durée aller :
{o['duree_aller']}

Durée retour :
{o['duree_retour']}

Bagage :
{o['bagage']}

Vendeur :
{o['vendeur']}. À privilégier pour réserver : {nom_site} (même vol, bagage inclus).

Prix vérifié sur :
NON VÉRIFIÉ. Prix observé sur : {o['source']}
Composition : {o['ventilation']}

Lien :
- Voir l'offre (dates pré-remplies, Google Flights) : {lien_google(o)}
- Réserver chez la compagnie : {url_site}
- Source du prix : {o['url_source']}

Heure de vérification finale :
Aucune vérification possible (sites de réservation inaccessibles). Observation : {o['observe_le'].replace('≈', 'vers ')} ; collecte par la source : {o['collecte_source']}.

Observations :
{o['observations']}
"""


def resultat_md():
    autres = [o for o in OFFRES if not o.get("dans_top3") and o.get("prix_final")]
    autres.sort(key=lambda o: o["prix_final"])
    duree = next(o for o in OFFRES if o.get("categorie") == "meilleur_rapport_duree")
    lille = next(o for o in OFFRES if o.get("categorie") == "meilleur_lille")
    lignes_autres = "\n".join(
        f"- {date_courte(o['date_aller'])} → {date_courte(o['date_retour'])} · {o['aeroport']} · "
        f"{o['compagnie']} · {o['type'].lower()} · {euros(o['prix_final'])} ({o['statut']}) — {o['observations']}"
        for o in autres)
    cov = D["couverture"]
    return f"""<!-- recherche_id: {META['recherche_id']} -->
# Vols Lille-région → Tunis — octobre 2026

DATE ET HEURE DE LA RECHERCHE
{date_fr(META['date_recherche'])}, {META['fenetre_recherche']}. Dernière observation : {META['derniere_observation'].split(' ')[1]}.

STATUT GLOBAL : {META['statut_global']}. Tous les prix ci-dessous sont des prix OBSERVÉS sur des comparateurs,
pas des prix VÉRIFIÉS dans un parcours de réservation (voir « Limites »).

Critères : {META['voyageur']} · aller-retour · {META['periode']} · {META['bagage_exige']}.

{bloc_md(TOP3[0], 'N°1 — MOINS CHER ABSOLU')}
{bloc_md(TOP3[1], 'N°2')}
{bloc_md(TOP3[2], 'N°3')}
==============================
MEILLEURE OPTION DIRECTE
==============================
{phrase_meilleurs()}

==============================
MEILLEUR RAPPORT PRIX / DURÉE
==============================
{date_courte(duree['date_aller'])} → {date_courte(duree['date_retour'])} 2026 · {duree['aeroport']} · {duree['compagnie']} direct ·
{nuits_txt(duree['nuits'])} · {euros(duree['prix_final'])} ({duree['statut']}) : {ecart(duree['prix_final'], N1['prix_final'])} par rapport au n°1 pour {duree['nuits'] - N1['nuits']} nuits de plus.

==============================
MEILLEUR DÉPART DE LILLE
==============================
{date_courte(lille['date_aller'])} → {date_courte(lille['date_retour'])} 2026 · Nouvelair direct · {euros(lille['prix_initial'])} affichés (bagage en soute non garanti) ·
au moins {ecart(lille['prix_initial'], N1['prix_final'])} par rapport au n°1. Ligne Lille–Tunis hebdomadaire (samedi), arrêtée après le 31/10.

==============================
EXCEPTION HORS RAYON
==============================
Aucune retenue. Paris-Orly (218 km) avec Transavia : ≈210–215 € avec 20 kg aller-retour (ESTIMÉ), soit plus cher que Bruxelles.

==============================
AUTRES DATES REMARQUABLES
==============================
{lignes_autres}

==============================
NIVEAU DE CONFIANCE : {META['statut_global']}
==============================
- Cartographie : {cov['cartographie']}
- Compagnies : {cov['compagnies']}
- Dates : {cov['dates']}
- Vérification : {cov['verification']}
- Zone restante : {cov['zone_restante']}

==============================
LIMITES DE CETTE RECHERCHE
==============================
- {META['limite_principale']}
- {META['acces_pc']}
- {META['heure_ete']}

==============================
VÉRIFIER EN 2 MINUTES AVANT D'ACHETER
==============================
""" + "\n".join(f"{i}. {t}" for i, t in enumerate(D["verification_a_faire"], 1)) + "\n"


def historique_md():
    lignes = ["| Rang | Offre | Prix | Statut |", "|---|---|---|---|"]
    for o in sorted(OFFRES, key=lambda o: (o["prix_final"] is None, o["prix_final"] or 0)):
        rang = o.get("rang") or "—"
        lignes.append(
            f"| {rang} | {o['code']} → TUN · {o['date_aller']} → {o['date_retour']} · {o['compagnie']} · {o['type']} "
            f"| {euros(o['prix_final']) if o['prix_final'] else euros(o['prix_initial']) + ' (hors bagage / incomplet)'} "
            f"| {o['statut']} |")
    return f"""# Recherche du {date_fr(META['date_recherche'])} — instantané

Fenêtre de recherche : {META['fenetre_recherche']}
Statut : {META['statut_global']} (aucun prix vérifié)

## TOP 3 de cette recherche
""" + "\n".join(
        f"{o['rang']}. {euros(o['prix_final'])} — {o['aeroport']} → Tunis · {date_courte(o['date_aller'])} → "
        f"{date_courte(o['date_retour'])} · {nuits_txt(o['nuits'])} · {o['compagnie']} · {o['type'].lower()} · {o['statut']}"
        for o in TOP3) + f"""

## Toutes les offres datées observées
{chr(10).join(lignes)}

## Limite
{META['limite_principale']}

Pour suivre l'évolution des prix lors d'une prochaine recherche : comparer ce tableau
avec la nouvelle version (fichier daté suivant) et avec `prix_observes.csv`
(les lignes sont ajoutées, jamais remplacées ; colonne `recherche_id`).
"""


def maj_resultat():
    chemin = os.path.join(BASE, "RESULTAT.md")
    contenu = resultat_md()
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as f:
            ancien = f.read()
        meme_recherche = f"<!-- recherche_id: {META['recherche_id']} -->" in ancien
        # On archive l'ancien résultat seulement s'il provient d'une autre recherche
        # (une même recherche affinée ne crée pas de faux historique).
        if ancien != contenu and not meme_recherche:
            stamp = dt.datetime.fromtimestamp(os.path.getmtime(chemin)).strftime("%Y-%m-%d_%H%M")
            archive = chemin_libre(os.path.join(BASE, "historique", f"RESULTAT_{stamp}.md"))
            shutil.copy2(chemin, archive)
    ecrire(chemin, contenu)


def maj_historique():
    """Un instantané par recherche (nommé d'après recherche_id) : une nouvelle recherche
    doit porter une nouvelle recherche_id, ce qui crée un nouveau fichier daté."""
    chemin = os.path.join(BASE, "historique", f"{META['recherche_id']}.md")
    ecrire(chemin, historique_md())
    return chemin


# ---------------------------------------------------------------- HTML
BADGES = {
    "VÉRIFIÉ": ("verifie", "✓"),
    "OBSERVÉ": ("observe", "◐"),
    "ESTIMÉ": ("estime", "≈"),
    "À REVÉRIFIER": ("reverifier", "!"),
    "INDISPONIBLE": ("indispo", "✕"),
    "PARTIELLE": ("reverifier", "◐"),
}


def badge(statut, prefixe=""):
    cls, ico = BADGES[statut]
    return (f'<span class="badge badge-{cls}"><span class="badge-ico" aria-hidden="true">{ico}</span>'
            f'{e(prefixe + statut)}</span>')


def actions_html(o, principal=True):
    nom_site, url_site = site_cie(o)
    if principal:
        return f"""<div class="actions">
        <a class="btn btn-primaire" href="{e(lien_google(o))}" target="_blank" rel="noopener">Voir / réserver l'offre <span class="btn-sous">Google Flights · dates pré-remplies</span></a>
        <a class="btn btn-secondaire" href="{e(url_site)}" target="_blank" rel="noopener">Réserver sur {e(nom_site)}</a>
        <a class="lien-discret" href="{e(o['url_source'])}" target="_blank" rel="noopener">Source du prix</a>
      </div>"""
    return f"""<div class="actions actions-carte">
        <a class="btn btn-secondaire" href="{e(lien_google(o))}" target="_blank" rel="noopener">Voir / réserver l'offre</a>
        <a class="lien-discret" href="{e(url_site)}" target="_blank" rel="noopener">{e(nom_site)}</a>
        <a class="lien-discret" href="{e(o['url_source'])}" target="_blank" rel="noopener">Source du prix</a>
      </div>"""


def compo_html(o):
    frais = "frais d'agence ou de paiement : inconnus" if o["frais"] is None else f"frais : {euros(o['frais'])}"
    bag = "bagage 23 kg inclus (0 €)" if o["prix_bagage"] == 0 else f"bagage : {euros(o['prix_bagage'])}"
    return (f'<p class="compo imprime"><strong>Composition :</strong> total affiché {euros(o["prix_final"])} '
            f'(taxes incluses, non séparable) · {e(bag)} · {e(frais)}</p>')


def details_html(o):
    return f"""<details class="details">
        <summary>Composition du prix, preuves et liens</summary>
        <div class="details-corps">
          <dl class="liste-def">
            <div><dt>Prix affiché (aller-retour, taxes incluses)</dt><dd>{euros(o['prix_initial'])}</dd></div>
            <div><dt>Supplément bagage en soute</dt><dd>{'aucun : 23 kg inclus' if o['prix_bagage'] == 0 else euros(o['prix_bagage'])}</dd></div>
            <div><dt>Frais obligatoires</dt><dd>{'inconnus (non visibles sans parcours de réservation)' if o['frais'] is None else euros(o['frais'])}</dd></div>
            <div class="total"><dt>Total observé</dt><dd>{euros(o['prix_final'])}</dd></div>
          </dl>
          <p class="note">{e(o['ventilation'])}</p>
          <p class="note"><strong>Vendeur :</strong> {e(o['vendeur'])}.</p>
          <p class="note"><strong>Source :</strong> {e(o['source'])} — collecte : {e(o['collecte_source'])}.</p>
          <p class="note"><strong>Preuve :</strong> aucune capture (pages de réservation inaccessibles depuis l'environnement de recherche). Les extraits de source sont consignés dans <a href="sources.md">sources.md</a>.</p>
          <p class="note"><strong>Autres comparateurs (dates pré-remplies) :</strong>
            <a href="{e(lien_skyscanner(o))}" target="_blank" rel="noopener">Skyscanner</a> ·
            <a href="{e(lien_kayak(o))}" target="_blank" rel="noopener">KAYAK</a> ·
            <a href="{e(lien_momondo(o))}" target="_blank" rel="noopener">momondo</a></p>
          <p class="note">{e(o['observations'])}</p>
        </div>
      </details>"""


def horaires_html(o):
    note = f'<p class="note-horaire">{e(o["note_horaire"])}</p>' if o.get("note_horaire") else ""
    return f"""<dl class="horaires">
          <div><dt>Aller</dt><dd>{e(o['horaire_aller'])} <span class="muet">· {e(o['duree_aller'])}</span></dd></div>
          <div><dt>Retour</dt><dd>{e(o['horaire_retour'])} <span class="muet">· {e(o['duree_retour'])}</span></dd></div>
        </dl>{note}"""


def minuscule(txt):
    return txt[:1].lower() + txt[1:] if txt else txt


def badges_offre(o, prefixe=""):
    return badge(o["statut"], prefixe) + (badge(o["badge"]) if o.get("badge") else "")


def a_noter_html(o):
    """Point de vigilance du n°1, calculé : départ proche d'un tarif non vérifié."""
    jours = (jour(o["date_aller"]) - jour(META["date_recherche"])).days
    if o["statut"] == "VÉRIFIÉ" or jours > 7 or len(TOP3) < 3:
        return ""
    d2 = TOP3[1]["prix_final"] - o["prix_final"]
    d3 = TOP3[2]["prix_final"] - o["prix_final"]
    return (f'<p class="a-noter"><strong>À noter :</strong> départ dans {jours} jours. Ce tarif n\'est pas vérifié '
            f'et a pu augmenter depuis sa collecte : dans ce cas, comparez avec les n°2 et n°3, '
            f'à {min(d2, d3)}–{max(d2, d3)}{NBSP}€ près.</p>')


def carte_gagnant(o):
    return f"""<section class="gagnant" id="n1" aria-labelledby="titre-n1">
      <div class="gagnant-tete">
        <h2 id="titre-n1"><span aria-hidden="true">🏆</span> Meilleur choix</h2>
        <div class="badges">{badges_offre(o, 'PRIX ')}</div>
      </div>
      <div class="gagnant-corps">
        <div class="prix-bloc">
          <p class="prix-hero">{euros(o['prix_final'])}</p>
          <p class="prix-sous">aller-retour · 1 adulte<br><strong>{e(o['bagage_court'])}</strong></p>
        </div>
        <div class="infos-bloc">
          <p class="trajet">{e(o['aeroport'])} <abbr title="code IATA">{e(o['code'])}</abbr> <span class="fleche" aria-hidden="true">→</span><span class="sr"> vers </span> Tunis-Carthage <abbr title="code IATA">TUN</abbr></p>
          <p class="dates">{date_courte(o['date_aller'])} → {date_courte(o['date_retour'], True)} · <strong>{nuits_txt(o['nuits'])}</strong></p>
          <p class="cie">{e(o['compagnie'])} <span class="muet">{e(o['vols'])}</span> · <span class="pastille pastille-direct">{e(o['type'])}</span></p>
          {horaires_html(o)}
          <p class="bagage"><span aria-hidden="true">🧳</span> {e(o['bagage'])}</p>
          <p class="vendeur"><strong>Où réserver :</strong> {e(site_cie(o)[0])} (prix vu sur un comparateur, vendeur non identifié)</p>
          {a_noter_html(o)}
        </div>
      </div>
      {actions_html(o)}
      {compo_html(o)}
      <p class="horodatage">Prix observé le {date_fr(META['date_recherche'])} vers {o['observe_le'].split('≈')[-1]} · collecte de la source : {e(minuscule(o['collecte_source']))} · <strong>non vérifié</strong></p>
      {details_html(o)}
    </section>"""


def delta_nuits(n, ref):
    d = n - ref
    if d == 0:
        return "même durée"
    return ("+" if d > 0 else "−") + nuits_txt(abs(d))


def carte_alternative(o, medaille, titre):
    d_prix = ecart(o["prix_final"], N1["prix_final"])
    txt_nuits = delta_nuits(o["nuits"], N1["nuits"])
    prec = TOP3[o["rang"] - 2]
    vs_prec = "" if prec is N1 else (f' <span class="muet">Par rapport au n°{prec["rang"]} : '
                                    f'{e(ecart(o["prix_final"], prec["prix_final"]))}, {e(delta_nuits(o["nuits"], prec["nuits"]))}.</span>')
    avantage = o.get("point_fort", "")
    return f"""<article class="carte" id="n{o['rang']}" aria-labelledby="titre-n{o['rang']}">
        <div class="carte-tete">
          <h3 id="titre-n{o['rang']}"><span aria-hidden="true">{medaille}</span> {e(titre)}</h3>
          <div class="badges">{badges_offre(o)}</div>
        </div>
        <div class="carte-prix">
          <p class="prix-carte">{euros(o['prix_final'])}</p>
          <ul class="ecarts" aria-label="Comparaison avec le n°1">
            <li class="ecart-prix">{e(d_prix)} vs n°1</li>
            <li class="ecart-nuits">{e(txt_nuits)}</li>
          </ul>
        </div>
        <p class="avantage">{e(avantage)}{vs_prec}</p>
        <p class="trajet trajet-petit">{e(o['aeroport'])} <abbr title="code IATA">{e(o['code'])}</abbr> → Tunis <abbr title="code IATA">TUN</abbr></p>
        <p class="dates">{date_courte(o['date_aller'])} → {date_courte(o['date_retour'], True)} · <strong>{nuits_txt(o['nuits'])}</strong></p>
        <p class="cie">{e(o['compagnie'])} · <span class="pastille pastille-direct">{e(o['type'])}</span> · <span class="muet">{e(o['bagage_court'])}</span></p>
        {horaires_html(o)}
        {actions_html(o, principal=False)}
        {compo_html(o)}
        <p class="horodatage">Observé le {date_fr(META['date_recherche'])} vers {o['observe_le'].split('≈')[-1]} · {e(o['source'])}</p>
        {details_html(o)}
      </article>"""


def note_comparaison():
    ecart13 = euros(TOP3[-1]["prix_final"] - N1["prix_final"])
    if MEME_VOL_TOP3:
        return (f'<p class="note">Les trois offres partent de {e(N1["aeroport"])} ({N1["distance_km"]} km de Lille ; '
                f'≈1 h 15 en voiture, estimation) avec les mêmes vols {e(N1["compagnie"])}. Seules les dates changent : '
                f'entre le n°1 et le n°3, l\'écart n\'est que de {ecart13}, trop peu pour départager les offres sans vérification.</p>')
    return f'<p class="note">Écart entre le n°1 et le n°3 : {ecart13}.</p>'


def tableau_comparatif():
    lignes = []
    for o in TOP3:
        lignes.append(f"""<tr{' class="ligne-n1"' if o['rang'] == 1 else ''}>
          <th scope="row" data-label="Rang"><span class="v">{['🏆', '🥈', '🥉'][o['rang'] - 1]} n°{o['rang']}</span></th>
          <td data-label="Prix final" class="num"><span class="v"><strong>{euros(o['prix_final'])}</strong></span></td>
          <td data-label="Départ"><span class="v">{e(o['code'])} <span class="muet">{e(o['aeroport'])}</span></span></td>
          <td data-label="Aller"><span class="v">{date_courte(o['date_aller'])}</span></td>
          <td data-label="Retour"><span class="v">{date_courte(o['date_retour'])}</span></td>
          <td data-label="Nuits" class="num"><span class="v">{o['nuits']}</span></td>
          <td data-label="Compagnie"><span class="v">{e(o['compagnie'])}</span></td>
          <td data-label="Vol"><span class="v">{e(o['type'].capitalize())}</span></td>
          <td data-label="Bagage"><span class="v">{e(o['bagage_court'])}</span></td>
          <td data-label="Vendeur"><span class="v">non identifié <span class="muet">(conseil : {e(site_cie(o)[0])})</span></span></td>
          <td data-label="Statut"><span class="v">{badge(o['statut'])}</span></td>
        </tr>""")
    return f"""<section class="section" id="comparaison" aria-labelledby="titre-comparaison">
      <h2 id="titre-comparaison">Comparer les trois offres</h2>
      <div class="table-cadre">
        <table class="comparatif">
          <caption class="sr">Comparaison des trois meilleures offres observées</caption>
          <thead><tr>
            <th scope="col">Rang</th><th scope="col">Prix final</th><th scope="col">Départ</th>
            <th scope="col">Aller</th><th scope="col">Retour</th><th scope="col">Nuits</th>
            <th scope="col">Compagnie</th><th scope="col">Vol</th><th scope="col">Bagage</th>
            <th scope="col">Vendeur</th><th scope="col">Statut</th>
          </tr></thead>
          <tbody>{''.join(lignes)}</tbody>
        </table>
      </div>
      {note_comparaison()}
    </section>"""


def a_savoir():
    duree = next(o for o in OFFRES if o.get("categorie") == "meilleur_rapport_duree")
    lille = next(o for o in OFFRES if o.get("categorie") == "meilleur_lille")
    remarquables = [o for o in OFFRES if o.get("remarquable")]
    items_rem = "".join(
        f"<li><strong>{date_courte(o['date_aller'])} → {date_courte(o['date_retour'])}</strong> · {e(o['code'])} · {e(o['compagnie'])} · "
        f"{euros(o['prix_final']) if o['prix_final'] else euros(o['prix_initial']) + ' sans bagage'} {badge(o['statut'])}"
        f"<br><span class=\"muet\">{e(o['observations'])}</span></li>" for o in remarquables)
    return f"""<section class="section" id="a-savoir" aria-labelledby="titre-savoir">
      <h2 id="titre-savoir">À savoir aussi</h2>
      <p class="chapeau">{e(phrase_meilleurs())}</p>
      <div class="grille-infos">
        <article class="info">
          <h3>Meilleur rapport prix / durée</h3>
          <p class="info-prix">{euros(duree['prix_final'])} <span class="muet">· {nuits_txt(duree['nuits'])}</span></p>
          <p>{date_courte(duree['date_aller'])} → {date_courte(duree['date_retour'])} · Bruxelles · Tunisair direct · 23 kg inclus</p>
          <p class="info-ecart">{e(ecart(duree['prix_final'], N1['prix_final']))} vs n°1, pour {duree['nuits'] - N1['nuits']} nuits de plus</p>
          <p>{badge(duree['statut'])}</p>
        </article>
        <article class="info">
          <h3>Meilleur départ de Lille</h3>
          <p class="info-prix">≈{euros(lille['prix_initial'])} <span class="muet">· {nuits_txt(lille['nuits'])}</span></p>
          <p>{date_courte(lille['date_aller'])} → {date_courte(lille['date_retour'])} · Nouvelair direct · bagage en soute non garanti</p>
          <p class="info-ecart">au moins {e(ecart(lille['prix_initial'], N1['prix_final']))} vs n°1</p>
          <p>{badge(lille['statut'])}{badge('À REVÉRIFIER')}</p>
        </article>
        <article class="info">
          <h3>Paris, hors rayon (218 km)</h3>
          <p class="info-prix">≈210–215 €</p>
          <p>Transavia depuis Orly, avec 20 kg aller-retour ajoutés : <strong>pas d'économie</strong> par rapport à Bruxelles.</p>
          <p>{badge('ESTIMÉ')}</p>
        </article>
        <article class="info">
          <h3>Charleroi</h3>
          <p class="info-prix">Aucun direct</p>
          <p>La ligne TUI fly Charleroi–Tunis n'est pas opérée en octobre 2026 (vols annulés).</p>
          <p>{badge('INDISPONIBLE')}</p>
        </article>
      </div>
      <h3 class="sous-titre">Autres dates remarquables</h3>
      <ul class="liste-rem">{items_rem}</ul>
    </section>"""


def fiabilite():
    cov = D["couverture"]
    legende = "".join(f"<li>{badge(k)} <span>{e(v)}</span></li>" for k, v in D["statuts"].items())
    etapes = "".join(f"<li>{e(t)}</li>" for t in D["verification_a_faire"])
    return f"""<section class="section" id="fiabilite" aria-labelledby="titre-fiabilite">
      <h2 id="titre-fiabilite">Niveau de confiance : recherche partielle</h2>
      <div class="grille-fiab">
        <div>
          <ul class="couverture">
            <li><strong>Aéroports :</strong> {e(cov['cartographie'])}</li>
            <li><strong>Compagnies :</strong> {e(cov['compagnies'])}</li>
            <li><strong>Dates :</strong> {e(cov['dates'])}</li>
            <li><strong>Vérification :</strong> {e(cov['verification'])}</li>
            <li><strong>Reste à couvrir :</strong> {e(cov['zone_restante'])}</li>
          </ul>
          <p class="note"><strong>Pourquoi :</strong> {e(META['limite_principale'])}</p>
        </div>
        <div class="encadre">
          <h3>Vérifier en 2 minutes avant d'acheter</h3>
          <ol>{etapes}</ol>
        </div>
      </div>
      <h3 class="sous-titre">Que signifient les statuts ?</h3>
      <ul class="legende">{legende}</ul>
    </section>"""


def aeroports_html():
    lignes = "".join(f"""<tr>
          <th scope="row" data-label="Aéroport"><span class="v">{e(a['code'])} <span class="muet">{e(a['nom'])}</span></span></th>
          <td data-label="Distance" class="num"><span class="v">{a['distance_km']} km</span></td>
          <td data-label="Direct vers TUN"><span class="v">{'<strong>oui</strong>' if a['direct_tun'] == 'oui' else e(a['direct_tun'])}</span></td>
          <td data-label="Compagnies"><span class="v">{e(a['compagnies'])}</span></td>
          <td data-label="Exploitation constatée"><span class="v">{e(a['jours'])}</span></td>
        </tr>""" for a in D["aeroports"])
    hors = "".join(f"<li><strong>{e(a['code'])} {e(a['nom'])}</strong> ({a['distance_km']} km) : {e(a['constat'])}</li>" for a in D["hors_rayon"])
    return f"""<section class="section" id="aeroports" aria-labelledby="titre-aeroports">
      <details class="details details-section">
        <summary><h2 id="titre-aeroports">Aéroports examinés autour de Lille ({len(D['aeroports'])})</h2></summary>
        <div class="details-corps">
          <p class="note">Distances à vol d'oiseau depuis la Grand-Place de Lille. Seuls Lille et Bruxelles-Zaventem ont un vol direct vers Tunis en octobre 2026.</p>
          <div class="table-cadre">
            <table class="tableau-aeroports">
              <caption class="sr">Aéroports commerciaux dans un rayon d'environ 150 km</caption>
              <thead><tr><th scope="col">Aéroport</th><th scope="col">Distance</th><th scope="col">Direct vers TUN</th><th scope="col">Compagnies</th><th scope="col">Exploitation constatée</th></tr></thead>
              <tbody>{lignes}</tbody>
            </table>
          </div>
          <h3 class="sous-titre">Au-delà de 150 km (étudiés comme exceptions possibles)</h3>
          <ul>{hors}</ul>
        </div>
      </details>
    </section>"""


def tracabilite_html():
    lignes = "".join(f"""<tr>
          <th scope="row" data-label="Rang"><span class="v">n°{o['rang']}</span></th>
          <td data-label="Prix et statut"><span class="v">{euros(o['prix_final'])} {badge(o['statut'])}</span></td>
          <td data-label="Source"><span class="v">{e(o['source'])}<br><a class="url" href="{e(o['url_source'])}" target="_blank" rel="noopener">{e(o['url_source'])}</a></span></td>
          <td data-label="Observé"><span class="v">{date_fr(META['date_recherche'])} {e(o['observe_le'].split(' ', 1)[1])}, <strong>non vérifié</strong><br><span class="muet">collecte : {e(minuscule(o['collecte_source']))}</span></span></td>
          <td data-label="Vérifier ici"><span class="v"><a href="{e(lien_google(o))}" target="_blank" rel="noopener">Google Flights</a> (dates pré-remplies)<br><a href="{e(site_cie(o)[1])}" target="_blank" rel="noopener">{e(site_cie(o)[1].replace('https://www.', ''))}</a></span></td>
        </tr>""" for o in TOP3)
    return f"""<h3 class="sous-titre">Traçabilité du TOP 3</h3>
          <div class="table-cadre">
            <table class="tableau-tracabilite">
              <caption class="sr">Source, URL et heure d'observation de chaque offre du TOP 3</caption>
              <thead><tr><th scope="col">Rang</th><th scope="col">Prix et statut</th><th scope="col">Source</th><th scope="col">Observé</th><th scope="col">Vérifier ici</th></tr></thead>
              <tbody>{lignes}</tbody>
            </table>
          </div>"""


def methode_html():
    refs = "".join(f"<li><strong>{e(r['route'])} · {e(r['compagnie'])}</strong> : {e(r['prix'])} — {e(r['note'])} {badge(r['statut'])}</li>" for r in REFS)
    return f"""<section class="section" id="methode" aria-labelledby="titre-methode">
      <details class="details details-section">
        <summary><h2 id="titre-methode">Méthode et sources</h2></summary>
        <div class="details-corps">
          <ol class="methode">
            <li><strong>Cartographie</strong> des aéroports à moins de 150 km de Lille (distances calculées) et des liaisons réellement programmées en octobre 2026 (sites de suivi de vols, presse aéronautique, page de l'aéroport de Lille).</li>
            <li><strong>Découverte des prix</strong> dans les pages de route de Skyscanner, momondo, KAYAK, Google Flights, monde-du-voyage, liligo, Trip.com, eDreams/Opodo, consultées via un moteur de recherche (seul accès possible).</li>
            <li><strong>Bagage</strong> : franchise Tunisair Europe ⇄ Tunisie = 23 kg inclus en Économie (le tarif « Light » sans soute n'existe que sur le Maroc) ; Nouvelair « Light » sans soute, « Easy » 25 kg ; Transavia 20 kg ≈ 40 € par trajet.</li>
            <li><strong>Classement</strong> sur le prix total observé, bagage ≥ 20 kg compris ; les offres sans bagage garanti sont écartées du TOP 3.</li>
            <li><strong>Vérification</strong> : impossible pendant cette recherche (accès bloqué). Elle reste à faire avant tout achat.</li>
          </ol>
          {tracabilite_html()}
          <h3 class="sous-titre">Prix de référence sans dates précises</h3>
          <ul class="liste-ref">{refs}</ul>
          <p class="note">Toutes les observations, avec URL et statut : <a href="prix_observes.csv">prix_observes.csv</a> · détail des sources : <a href="sources.md">sources.md</a> · résultat texte : <a href="RESULTAT.md">RESULTAT.md</a> · données structurées : <a href="donnees/resultats.json">donnees/resultats.json</a>.</p>
        </div>
      </details>
    </section>"""


CSS = r"""
:root{
  --page:#f6f6f3; --surface:#ffffff; --surface-2:#f1f0ec;
  --ink:#0b0b0b; --ink-2:#45443f; --muted:#6a6964;
  --line:#e1e0d9; --line-2:#c3c2b7;
  --accent:#1d4fa3; --accent-ink:#ffffff; --accent-soft:#eaf0fb; --accent-line:#9db5e3;
  --good:#0ca30c; --warning:#fab219; --serious:#ec835a; --critical:#d03b3b; --neutral:#898781;
  --good-bg:#e3f5e3; --warning-bg:#fff3d6; --serious-bg:#fde9e1; --critical-bg:#fbe4e4; --neutral-bg:#efeeea;
  --radius:14px; --shadow:0 1px 2px rgba(11,11,11,.06),0 4px 16px rgba(11,11,11,.06);
  color-scheme:light dark;
}
@media screen and (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --page:#0d0d0d; --surface:#1a1a19; --surface-2:#232321;
    --ink:#ffffff; --ink-2:#d5d4cb; --muted:#a6a59d;
    --line:#2c2c2a; --line-2:#45453f;
    --accent:#8db4ff; --accent-ink:#0b0b0b; --accent-soft:#16233b; --accent-line:#34507e;
    --good-bg:#12301a; --warning-bg:#3a2c08; --serious-bg:#3b2116; --critical-bg:#3a1616; --neutral-bg:#2a2a27;
    --shadow:none;
  }
}
@media screen{
:root[data-theme="dark"]{
  --page:#0d0d0d; --surface:#1a1a19; --surface-2:#232321;
  --ink:#ffffff; --ink-2:#d5d4cb; --muted:#a6a59d;
  --line:#2c2c2a; --line-2:#45453f;
  --accent:#8db4ff; --accent-ink:#0b0b0b; --accent-soft:#16233b; --accent-line:#34507e;
  --good-bg:#12301a; --warning-bg:#3a2c08; --serious-bg:#3b2116; --critical-bg:#3a1616; --neutral-bg:#2a2a27;
  --shadow:none;
}
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--page);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent);text-underline-offset:2px}
a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:6px}
abbr{text-decoration:none;font-weight:600;letter-spacing:.02em}
h1,h2,h3{line-height:1.2;margin:0}
p{margin:0}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.page{max-width:1080px;margin:0 auto;padding:24px 16px 48px}
.muet{color:var(--muted);font-weight:400}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}

/* En-tête */
.entete{display:grid;gap:8px;margin-bottom:16px}
.surtitre{color:var(--ink-2);font-size:.95rem}
.entete h1{font-size:clamp(1.6rem,4vw,2.2rem);letter-spacing:-.01em}
.fraicheur{font-size:1rem}
.meta{display:flex;flex-wrap:wrap;gap:8px 16px;list-style:none;margin:4px 0 0;padding:0;color:var(--ink-2);font-size:.95rem;align-items:center}
.meta b{color:var(--ink)}
.dynamique{font-size:.85rem}

/* Badges (statut = icône + libellé, jamais la couleur seule) */
.badges{display:flex;flex-wrap:wrap;gap:6px}
.badge{display:inline-flex;align-items:center;gap:5px;padding:2px 9px 2px 7px;border-radius:999px;border:1.5px solid;font-size:.78rem;font-weight:700;letter-spacing:.03em;line-height:1.5;color:var(--ink);white-space:nowrap;vertical-align:middle}
.badge-ico{font-weight:800}
.badge-verifie{border-color:var(--good);background:var(--good-bg)}
.badge-observe{border-color:var(--warning);background:var(--warning-bg)}
.badge-reverifier{border-color:var(--serious);background:var(--serious-bg)}
.badge-estime{border-color:var(--neutral);background:var(--neutral-bg)}
.badge-indispo{border-color:var(--critical);background:var(--critical-bg)}

/* Bandeau d'avertissement */
.alerte{display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--serious);background:var(--serious-bg);border-radius:12px;padding:12px 14px;margin:0 0 20px;font-size:.95rem}
.alerte-ico{font-weight:800;font-size:1.1rem;line-height:1.3}

/* Gagnant */
.gagnant{background:var(--surface);border:2px solid var(--accent);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px;display:grid;gap:16px}
.gagnant-tete,.carte-tete{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between}
.gagnant-tete h2{font-size:1.15rem;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)}
.gagnant-corps{display:grid;grid-template-columns:minmax(200px,280px) 1fr;gap:20px;align-items:start}
.prix-bloc{background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:12px;padding:16px 18px}
.prix-hero{font-size:clamp(3rem,9vw,4.5rem);font-weight:750;line-height:1;letter-spacing:-.02em}
.prix-sous{margin-top:10px;color:var(--ink-2)}
.prix-sous strong{color:var(--ink)}
.infos-bloc{display:grid;gap:8px}
.trajet{font-size:1.3rem;font-weight:650}
.trajet-petit{font-size:1.05rem}
.fleche{color:var(--muted);padding:0 2px}
.dates{font-size:1.1rem}
.cie{font-size:1rem}
.pastille{display:inline-block;padding:1px 8px;border-radius:6px;font-size:.78rem;font-weight:800;letter-spacing:.05em;border:1.5px solid var(--ink-2)}
.horaires{display:grid;grid-template-columns:repeat(2,minmax(0,max-content));gap:4px 24px;margin:2px 0}
.horaires div{display:flex;gap:8px;flex-wrap:wrap}
.horaires dt{font-weight:700;min-width:3.6em}
.horaires dd{margin:0;font-variant-numeric:tabular-nums}
.bagage,.vendeur{color:var(--ink-2)}
.a-noter{font-size:.92rem;border-left:3px solid var(--serious);padding:2px 0 2px 10px}
.horodatage{font-size:.85rem;color:var(--muted)}

/* Boutons */
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.btn{display:inline-flex;flex-direction:column;justify-content:center;min-height:44px;padding:8px 16px;border-radius:10px;font-weight:700;line-height:1.25;text-decoration:none;border:1.5px solid var(--accent)}
.btn-primaire{background:var(--accent);color:var(--accent-ink)}
.btn-secondaire{background:transparent;color:var(--accent)}
.btn:hover{filter:brightness(1.08)}
.btn-sous{font-size:.78rem;font-weight:500;opacity:.92}
.lien-discret{font-size:.92rem}
.actions-carte{gap:8px 16px}
.note-horaire{font-size:.85rem;color:var(--muted);margin-top:-2px}
.chapeau{margin-bottom:12px;color:var(--ink-2)}
.imprime{display:none}

/* Détails (divulgation progressive) */
.details{border-top:1px solid var(--line);padding-top:10px}
.details summary{cursor:pointer;font-weight:650;color:var(--ink-2);list-style-position:outside}
.details summary h2{display:inline;font-size:1.25rem;color:var(--ink)}
.details-corps{display:grid;gap:8px;margin-top:10px}
.liste-def{display:grid;gap:2px;margin:0;max-width:440px}
.liste-def div{display:flex;justify-content:space-between;gap:16px;padding:3px 0;border-bottom:1px dashed var(--line)}
.liste-def dt{color:var(--ink-2)}
.liste-def dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.liste-def .total{border-bottom:0;border-top:1.5px solid var(--ink-2);font-weight:750}
.note{font-size:.92rem;color:var(--ink-2)}

/* Alternatives */
.alternatives{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.carte{background:var(--surface);border:1px solid var(--line-2);border-radius:var(--radius);padding:18px;display:grid;gap:10px;align-content:start}
.carte-tete h3{font-size:1.05rem}
.carte-prix{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:baseline}
.prix-carte{font-size:2.3rem;font-weight:750;line-height:1;letter-spacing:-.01em}
.ecarts{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}
.ecarts li{font-size:.85rem;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--surface-2);border:1px solid var(--line-2)}
.avantage{font-weight:600}

/* Sections */
.section{margin-top:32px}
.section>h2{font-size:1.35rem;margin-bottom:12px}
.sous-titre{font-size:1.05rem;margin:18px 0 8px}

/* Tableaux */
.table-cadre{overflow-x:auto;border:1px solid var(--line-2);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{padding:9px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
thead th{background:var(--surface-2);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-2)}
tbody tr:last-child>*{border-bottom:0}
.ligne-n1{background:var(--accent-soft)}

/* À savoir */
.grille-infos{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.info{background:var(--surface);border:1px solid var(--line-2);border-radius:12px;padding:14px;display:grid;gap:6px;align-content:start}
.info h3{font-size:.95rem;color:var(--ink-2)}
.info-prix{font-size:1.5rem;font-weight:750}
.info-ecart{font-weight:650}
.liste-rem,.liste-ref{display:grid;gap:10px;padding-left:20px;margin:0}

/* Fiabilité */
.grille-fiab{display:grid;grid-template-columns:1.4fr 1fr;gap:16px}
.couverture{display:grid;gap:8px;padding-left:20px;margin:0 0 10px}
.encadre{background:var(--surface);border:1.5px solid var(--accent-line);border-radius:12px;padding:14px 16px}
.encadre h3{font-size:1rem;margin-bottom:8px}
.encadre ol{margin:0;padding-left:20px;display:grid;gap:6px}
.legende{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.legende li{display:flex;gap:10px;align-items:flex-start}
.legende li .badge{min-width:150px;justify-content:center}
.methode{display:grid;gap:8px;padding-left:20px;margin:0}

.pied{margin-top:36px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem;display:grid;gap:4px}

/* Fenêtres moyennes et petites : les tableaux deviennent des fiches empilées (aucune colonne coupée) */
@media screen and (max-width:980px){
  .table-cadre{overflow:visible;border:0;background:transparent}
  table,thead,tbody,tr,th,td{display:block}
  thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
  tbody tr{background:var(--surface);border:1px solid var(--line-2);border-radius:12px;margin-bottom:10px;padding:6px 12px}
  tbody tr.ligne-n1{background:var(--accent-soft);border-color:var(--accent-line)}
  th,td{border:0;padding:5px 0;display:grid;grid-template-columns:7.5em 1fr;gap:10px}
  th[data-label]::before,td[data-label]::before{content:attr(data-label);font-weight:700;color:var(--ink-2);font-size:.8rem;text-transform:uppercase;letter-spacing:.03em}
  .num{white-space:normal}
}
@media screen and (min-width:761px) and (max-width:980px){
  tbody tr{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}
}

/* Petits écrans (écran uniquement : la page A4 imprimée fait ≈710 px de large) */
@media screen and (max-width:760px){
  .page{padding:14px 16px 40px}
  .entete{gap:4px;margin-bottom:12px}
  .surtitre{font-size:.85rem}
  .entete h1{font-size:1.5rem}
  .fraicheur{font-size:.92rem}
  .meta{gap:4px 12px;font-size:.88rem;margin-top:2px}
  .alerte{padding:9px 12px;font-size:.88rem;margin-bottom:14px;gap:8px}
  .gagnant{padding:14px;gap:12px}
  .gagnant-tete h2{font-size:1rem}
  .gagnant-corps{grid-template-columns:1fr;gap:12px}
  .prix-bloc{padding:12px 14px}
  .alternatives{grid-template-columns:1fr}
  .grille-fiab{grid-template-columns:1fr}
  .horaires{grid-template-columns:1fr}
  .legende li{flex-direction:column;gap:4px}
  .legende li .badge{min-width:0}
  .actions .btn{flex:1 1 100%;align-items:center;text-align:center}
}

/* Impression / PDF */
@page{size:A4}
@media print{
  :root{--page:#fff;--surface:#fff;--shadow:none;color-scheme:light}
  body{font-size:9.5pt;line-height:1.4;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:none;padding:0}
  /* Page 1 : en-tête, avertissement et les trois offres */
  .entete{gap:2px;margin-bottom:6px}
  .surtitre{font-size:8.5pt}
  .entete h1{font-size:18pt}
  .meta{font-size:8.5pt;margin-top:0}
  .alerte{margin-bottom:8px;padding:6px 10px;font-size:8.5pt}
  .gagnant{padding:10px 12px;gap:7px;break-inside:avoid;border-width:1.5pt}
  .gagnant-tete h2{font-size:10.5pt}
  .gagnant-corps{grid-template-columns:180px 1fr;gap:12px}
  .prix-bloc{padding:10px 12px}
  .prix-hero{font-size:36pt}
  .prix-sous{margin-top:6px;font-size:9pt}
  .infos-bloc{gap:4px}
  .trajet{font-size:12pt}
  .dates{font-size:10.5pt}
  .alternatives{grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
  .carte{padding:8px 10px;gap:4px;break-inside:avoid}
  .carte-tete h3{font-size:10pt}
  .prix-carte{font-size:19pt}
  .ecarts li{font-size:8pt;padding:1px 6px}
  .avantage{font-size:9pt}
  .trajet-petit{font-size:9.5pt}
  .note-horaire{font-size:7.5pt}
  .btn{min-height:0;padding:3px 8px;font-size:8pt}
  .btn-sous{font-size:7pt}
  .actions{gap:6px}
  .lien-discret{font-size:8pt}
  .horodatage{font-size:7.5pt}
  .carte .horodatage{display:none}
  .details{padding-top:4px;border-top:0}
  .details summary{list-style:none}
  .details summary::-webkit-details-marker{display:none}
  .gagnant .details,.carte .details{display:none}
  /* Pages suivantes */
  .section{margin-top:12px;break-inside:auto}
  .section>h2,.details summary h2{font-size:13pt}
  #methode{break-before:page}
  .grille-infos{break-inside:avoid}
  .legende,.grille-fiab{break-inside:avoid}
  .details-section>summary{break-after:avoid}
  .pied{display:none}
  .liste-ref{gap:5px}
  #comparaison{margin-top:8px;break-inside:avoid}
  #comparaison .note{font-size:8pt}
  .a-noter{font-size:8pt;padding:1px 0 1px 8px}
  .bagage,.vendeur{font-size:8.5pt}
  .entete h1{font-size:16pt}
  .alerte{font-size:8pt;padding:5px 8px}
  .gagnant .horodatage{font-size:7pt}
  .section>h2,.sous-titre{break-after:avoid}
  .imprime{display:block}
  .compo{font-size:7.5pt;color:var(--ink-2)}
  .cie{font-size:9.5pt}
  .note,.chapeau{font-size:8.5pt}
  .couverture{gap:4px}
  .grille-infos{grid-template-columns:repeat(2,1fr);gap:8px}
  .info{padding:8px 10px;gap:3px}
  .info-prix{font-size:13pt}
  .liste-rem{gap:4px}
  .info,.encadre,tr,.liste-rem li,.legende li{break-inside:avoid}
  .table-cadre{overflow:visible}
  table{font-size:8pt}
  th,td{padding:4px 5px}
  .url{word-break:break-all;font-size:7pt}
}
"""

JS = r"""
(function(){
  // Avant impression / export PDF : ouvrir les sections repliées, puis rétablir l'état.
  var ouvertes = [];
  window.addEventListener('beforeprint', function(){
    ouvertes = [];
    document.querySelectorAll('details.details-section').forEach(function(d){
      if(!d.open){ d.open = true; ouvertes.push(d); }
    });
  });
  window.addEventListener('afterprint', function(){
    ouvertes.forEach(function(d){ d.open = false; });
  });
})();
"""


def page_html():
    n2, n3 = TOP3[1], TOP3[2]
    donnees = json.dumps(D, ensure_ascii=False, indent=1).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vols Tunis octobre 2026</title>
<meta name="description" content="Aller-retour le moins cher vers Tunis (TUN) en octobre 2026 depuis les aéroports autour de Lille, 1 adulte, bagage en soute d'au moins 20 kg. Prix observés le {date_fr(META['date_recherche'])}, non vérifiés.">
<style>{CSS}</style>
</head>
<body>
<main class="page">
  <header class="entete">
    <p class="surtitre">1 adulte · aller-retour · bagage en soute d'au moins 20 kg · aéroports à 150 km ou moins de Lille</p>
    <h1>Vols vers Tunis — Octobre 2026</h1>
    <p class="fraicheur"><strong>Prix observés le {date_fr(META['date_recherche'])} à {META['derniere_observation'].split(' ')[1]}</strong> · <span class="muet">non vérifiés dans un parcours de réservation</span></p>
    <p class="dynamique muet">Les tarifs aériens sont dynamiques et peuvent évoluer après cette observation.</p>
    <ul class="meta">
      <li><b>{META['aeroports_examines']}</b> aéroports examinés</li>
      <li><b>{META['offres_examinees']}</b> offres examinées</li>
      <li>Recherche : {badge('PARTIELLE')}</li>
    </ul>
  </header>

  <aside class="alerte" role="note">
    <span class="alerte-ico" aria-hidden="true">!</span>
    <p><strong>Prix à confirmer avant d'acheter.</strong> Ils ont été vus sur des comparateurs vers fin septembre et n'ont pas pu être vérifiés sur les sites de réservation, inaccessibles pendant la recherche. Ils ont pu augmenter depuis. <a href="#fiabilite">Pourquoi, et comment vérifier en 2 minutes</a></p>
  </aside>

  {carte_gagnant(N1)}

  <div class="alternatives">
    {carte_alternative(n2, '🥈', 'Option n°2')}
    {carte_alternative(n3, '🥉', 'Option n°3')}
  </div>

  {tableau_comparatif()}
  {a_savoir()}
  {fiabilite()}
  {aeroports_html()}
  {methode_html()}

  <footer class="pied">
    <p><strong>Les tarifs aériens sont dynamiques et peuvent évoluer après cette observation.</strong></p>
    <p>Page générée le {date_fr(META['date_recherche'])} à partir de <code>donnees/resultats.json</code> (source de vérité) par <code>outils/construire.py</code>. Rien n'a été réservé ni payé.</p>
  </footer>
</main>
<script type="application/json" id="donnees-source">{donnees}</script>
<script>{JS}</script>
</body>
</html>
"""


def main():
    n, conservees = maj_csv()
    ecrire_aeroports()
    maj_resultat()
    hist = maj_historique()
    ecrire(os.path.join(BASE, "Vols_Tunis_Octobre_2026.html"), page_html())
    empreinte = hashlib.sha256(json.dumps(D, sort_keys=True).encode()).hexdigest()[:12]
    print(f"CSV : {n} ligne(s) pour cette recherche, {conservees} conservée(s) des recherches précédentes · historique : {os.path.relpath(hist, BASE)} · données {empreinte}")
    print("TOP 3 :", " | ".join(f"{o['rang']}. {o['code']} {o['date_aller']}→{o['date_retour']} {o['prix_final']} €" for o in TOP3))


if __name__ == "__main__":
    main()
