# Sony Bravia TV

Pilotez vos téléviseurs Sony Bravia depuis Gladys, sur votre réseau local :
allumer et éteindre, régler le volume, changer d'entrée, ouvrir une
application, changer de chaîne, appuyer sur n'importe quelle touche de la
télécommande, depuis le tableau de bord ou depuis une scène. Et réagir à ce qui
se passe à l'écran : « quand la console allume le téléviseur sur HDMI 2,
tamiser les lumières ».

> **Développée sans le matériel : vos retours sont les bienvenus.** Cette
> intégration a été construite et testée sur les réponses documentées par Sony
> (API REST Bravia et IRCC-IP) et sur celles de la bibliothèque libre pybravia,
> avec un téléviseur simulé, pas avec un vrai Bravia. Si quelque chose ne
> fonctionne pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-sony-bravia/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un **téléviseur Sony Bravia Android TV ou Google TV** (2015 et après), sur le
  même réseau local que Gladys, avec une adresse IP fixe (une réservation DHCP
  dans votre box ou routeur).
- Le **contrôle IP** activé sur le téléviseur. Les menus varient selon le
  modèle ; en général **Paramètres → Réseau et Internet → Réseau domestique →
  Contrôle IP** (ou **Paramètres → Réseau → Configuration du réseau domestique
  → Contrôle IP**) :
  - **Authentification** : _Normale et clé pré-partagée_ ;
  - **Clé pré-partagée** : saisissez une clé de votre choix, par exemple
    `gladys2026` ;
  - le **contrôle IP simple** n'est pas nécessaire.
- Le **démarrage à distance** activé (**Paramètres → Réseau et Internet →
  Démarrage à distance**) : sans lui, un téléviseur en veille ne peut pas être
  allumé par le réseau.

## Configuration

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse** de votre téléviseur (par
   exemple `192.168.1.20`), puis authentifiez-le de l'une des deux façons
   ci-dessous, et donnez-lui si vous voulez un **Nom**. Deux ou trois
   téléviseurs ? Remplissez aussi les sections _Deuxième téléviseur_ et
   _Troisième téléviseur_.
3. Enregistrez, puis cliquez sur **Tester la connexion** : le message sous le
   bouton indique, pour chaque téléviseur, s'il répond, son modèle et s'il est
   allumé.
4. Ouvrez l'onglet **Découverte** : un appareil par téléviseur. Cliquez sur
   **Ajouter**, choisissez une pièce, enregistrez. Un téléviseur y apparaît dès
   qu'il a répondu une fois : allumez-le s'il n'y est pas.

### Avec une clé pré-partagée (recommandé)

Saisissez la clé réglée sur le téléviseur dans **Clé pré-partagée**. Rien
d'autre à faire.

### Avec un code PIN

Sans clé pré-partagée, le téléviseur peut s'appairer avec Gladys comme avec son
application mobile :

1. Laissez **Clé pré-partagée** vide, saisissez l'adresse, enregistrez.
2. Allumez le téléviseur, puis cliquez sur **Afficher un code PIN sur le
   téléviseur** (choisissez le téléviseur) : un code à 4 chiffres s'affiche à
   l'écran.
3. Saisissez-le dans **Code PIN (sans clé)**, enregistrez. Gladys s'enregistre
   sur le téléviseur sous le nom _Gladys Assistant_, et s'enregistre à nouveau
   avec le même code quand le téléviseur le demande (environ toutes les deux
   semaines).

Les options en bas de la page :

- **Wake-on-LAN** (activé par défaut) : beaucoup de Bravia coupent leur réseau
  en veille. Gladys demande alors à son cœur d'envoyer un paquet Wake-on-LAN à
  l'adresse MAC donnée par le téléviseur, ce qui le réveille. L'intégration le
  déclare, comme l'indique l'écran d'installation.
- **Intervalle de rafraîchissement** : la fréquence de lecture des téléviseurs
  (10 s par défaut). Un téléviseur en veille n'est interrogé que sur son état
  d'alimentation.
- **Pas du volume** : la variation de chaque appui sur _Volume +_ et
  _Volume −_.
- **Langue des noms de fonctionnalités** : les noms donnés aux fonctionnalités
  quand vous ajoutez un appareil, et les textes des listes et des événements de
  scène.

## L'appareil de chaque téléviseur

| Fonctionnalité      | Ce qu'elle fait                                                                                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marche / arrêt      | Allumé ou en veille. L'allumage passe par le démarrage à distance, ou par le Wake-on-LAN quand le téléviseur ne répond plus du tout.                                                                                       |
| Volume              | Le volume des haut-parleurs du téléviseur, de 0 à 100, en curseur.                                                                                                                                                         |
| Diminuer le volume  | Baisse le volume du pas configuré (les touches de la télécommande quand une barre de son prend le son).                                                                                                                    |
| Augmenter le volume | Monte le volume de la même façon.                                                                                                                                                                                          |
| Muet                | Coupe ou rétablit le son.                                                                                                                                                                                                  |
| Entrée              | L'entrée à l'écran (HDMI 1, HDMI 2…, avec les noms que vous leur avez donnés sur le téléviseur), et pour passer sur une autre. _Autre (TV, applis)_ indique une application ou le tuner, et la choisir appuie sur Accueil. |
| Application         | Ouvre une des applications du téléviseur. Affiche l'application ouverte par Gladys, jusqu'au prochain changement d'écran ; _Écran d'accueil_ appuie sur Accueil.                                                           |
| Chaîne              | Le numéro de la chaîne à l'écran, et pour passer sur un autre numéro.                                                                                                                                                      |
| Chaîne précédente   | Chaîne précédente.                                                                                                                                                                                                         |
| Chaîne suivante     | Chaîne suivante.                                                                                                                                                                                                           |
| En cours            | Ce qui est à l'écran, en texte : une entrée, `5 · France 5 — programme`, _Application ou écran d'accueil_, ou _Éteinte_.                                                                                                   |

Les listes d'entrées et d'applications sont lues sur le téléviseur (toutes les
30 minutes et toutes les 6 heures, quand il est allumé) et gardées par
l'intégration : elles sont là même quand le téléviseur dort. Une commande qui
a besoin de l'écran (une entrée, une application, une chaîne) allume d'abord le
téléviseur et l'attend, jusqu'à 20 secondes.

## Tableau de bord

Trois widgets, à placer côte à côte ; chacun montre un téléviseur (le premier
de la configuration quand aucun n'est choisi dans ses réglages). Le cœur
autorise quatre boutons par widget, d'où les trois.

- **Télécommande Bravia** : l'état du téléviseur, ce qui est à l'écran, le
  volume, et les boutons **Allumer** (ou _Éteindre_), **Volume −**,
  **Volume +** et **Muet**.
- **Touches Bravia** : quatre touches de la télécommande, choisies dans les
  réglages du widget : les flèches par défaut. Ajoutez-en un second avec _OK_,
  _Retour_, _Accueil_, _Entrée_, ou _Lecture_ et _Pause_…
- **Raccourcis Bravia** : jusqu'à quatre entrées ou applications favorites,
  saisies par leur nom dans les réglages (`HDMI 2`, `PS5`, `Netflix`…) ; les
  entrées branchées quand aucun nom n'est saisi. Un appui l'affiche, le
  téléviseur allumé d'abord. Un nom que le téléviseur ne connaît pas est
  signalé sous les boutons.

## Scènes

### Déclencheur

**TV : entrée, chaîne ou application changée** : ce qui est à l'écran a
changé, allumage compris. Filtres : le téléviseur, ce qui est désormais à
l'écran (entrée, chaîne, application ou écran d'accueil), son nom exactement
comme le téléviseur l'affiche (`PS5`, `HDMI 2`, `TF1`), et qui l'a changé
(Gladys, ou le téléviseur et sa télécommande, une console en HDMI-CEC…).
Variables : le téléviseur, le type (`input`, `channel`, `app`), le nom (de
l'entrée, de la chaîne, ou de l'application ouverte par Gladys), le numéro de
chaîne, le programme, et qui l'a changé.

L'API du téléviseur ne dit jamais quelle application est au premier plan : une
application ouverte depuis la télécommande donne _Application ou écran
d'accueil_ ; passer d'une application à une autre ne déclenche rien.

Pas de déclencheur « téléviseur allumé » ou « téléviseur éteint » : la
fonctionnalité **Marche / arrêt** déclenche déjà les scènes, comme tout
appareil.

### Actions

- **Ouvrir une application sur le téléviseur** : par son nom comme sur le
  téléviseur (`Netflix`, `prime video` : majuscules, accents et espaces ne
  comptent pas). Sortie : l'application ouverte.
- **Choisir une entrée du téléviseur** : par son nom (`HDMI 2`) ou l'étiquette
  réglée sur le téléviseur (`PS5`). Sortie : l'entrée choisie.
- **Envoyer une touche de télécommande** : Accueil, Retour, flèches, OK,
  Entrée, volume, chaînes, lecture, couleurs, chiffres, d'une à dix fois.
  Sortie : les appuis envoyés.

Les deux premières allument d'abord le téléviseur si besoin. Avec plusieurs
téléviseurs, choisissez le téléviseur dans l'action. Les fonctionnalités
**Marche / arrêt**, **Volume** et **Chaîne** sont dans l'action habituelle
_Contrôler un appareil_.

### Idées de scènes

- **Soirée film** : le vendredi à 21 h, _Ouvrir une application sur le
  téléviseur_ `Netflix`, tamiser les lumières du salon.
- **La console est allumée** : déclencheur _TV : entrée, chaîne ou application
  changée_, désormais à l'écran _Entrée_, nom `PS5` : passer les lumières en
  ambiance jeu.
- **Départ de la maison** : dans la scène « tout le monde est parti », mettre la
  **Marche / arrêt** des téléviseurs sur arrêt.
- **Journal** : à 20 h, _Choisir une entrée du téléviseur_ `Freebox`, puis
  _Envoyer une touche de télécommande_ `2`.

## Dépannage

- **« Pas encore joint : allumez le téléviseur une fois »** : le téléviseur n'a
  jamais répondu. Vérifiez son adresse, allumez-le, et vérifiez que le contrôle
  IP est activé.
- **« Clé ou code PIN refusé »** : la clé pré-partagée diffère de celle du
  téléviseur, ou le code PIN a expiré : cliquez à nouveau sur _Afficher un code
  PIN sur le téléviseur_.
- **« Le téléviseur demande une clé pré-partagée ou un code PIN »** : aucun des
  deux n'est saisi.
- **« Pas de contrôle IP Bravia à cette adresse »** : un autre appareil répond
  à cette adresse, ou le contrôle IP est désactivé.
- **Le téléviseur ne s'allume pas** : activez le _démarrage à distance_ sur le
  téléviseur. Si son réseau s'endort en veille, gardez le _Wake-on-LAN_
  activé ; le Wake-on-LAN doit aussi être autorisé sur le téléviseur (souvent
  avec le démarrage à distance), et il ne traverse ni routeur ni VLAN.
- **Les boutons de volume ne font rien sur la barre de son** : l'intégration
  envoie alors les touches de la télécommande, que la barre de son suit en
  HDMI-CEC ; le curseur **Volume** ne règle que les haut-parleurs du
  téléviseur.
- **Une application est introuvable** : son nom doit faire partie du nom
  affiché par le téléviseur ; la liste est relue quand un nom est introuvable.
- Les logs de l'intégration (onglet **Configuration**) disent ce que répond
  chaque téléviseur ; aucune clé ni aucun code PIN n'y est jamais écrit.

## Limites

- Développée sans le matériel : les comportements viennent de la documentation
  de Sony et de pybravia, pas d'un vrai téléviseur.
- Les Bravia Android TV et Google TV avec contrôle IP. Les Bravia plus anciens
  (avant 2015) et les écrans professionnels sans contrôle IP ne sont pas pris
  en charge.
- L'API ne dit ni quelle application est au premier plan, ni le programme
  d'une source HDMI.
- Chaînes : celles du tuner du téléviseur (sources `tv:`), lues une fois par
  jour.
- Tout reste sur votre réseau local : pas de cloud, pas de compte Sony.
  L'intégration ne parle qu'aux téléviseurs configurés, et demande au cœur de
  Gladys les paquets Wake-on-LAN.
- Non affiliée à Sony. Bravia est une marque de Sony Group Corporation.
