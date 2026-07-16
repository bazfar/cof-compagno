/* ============================================================
   COF-COMPAGNO — Catalogue d'armes de monstres/PNJ (bestiaire).

   Référencé par armeId depuis data/bestiaire.json (cf. attaques[]), même
   principe que l'équipement des PJ (data/loot.js) : chaque attaque-arme
   pointe vers une entrée ici plutôt que de dupliquer degats/portee/typedegats
   inline. Peu de réutilisation entre monstres (armes calibrées par créature,
   contrairement au matériel des PJ) — l'intérêt est la cohérence structurelle
   et la compatibilité future avec le système d'affixes (js/affixes.js) si un
   jour une arme de monstre en reçoit un.

   Généré automatiquement par une migration ponctuelle depuis les anciens
   champs jet/degats/portee/type inline de bestiaire.json — modifier ici
   directement pour tout ajustement futur (pas de round-trip vers un script).
   ============================================================ */

const ARMES_MONSTRES = [
  {
    "id": "dague_rouillee",
    "nom": "Dague rouillée",
    "type": "arme",
    "degats": "1d4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "fronde",
    "nom": "Fronde",
    "type": "arme",
    "degats": "1d4",
    "portee": "moyenne (18m)",
    "typedegats": "physique"
  },
  {
    "id": "couperet",
    "nom": "Couperet",
    "type": "arme",
    "degats": "1d6+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "javelot",
    "nom": "Javelot",
    "type": "arme",
    "degats": "1d6",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "sabre_recupere",
    "nom": "Sabre récupéré",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "filet_de_chasse",
    "nom": "Filet de chasse",
    "type": "arme",
    "degats": "0",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "baton_noueux",
    "nom": "Bâton noueux",
    "type": "arme",
    "degats": "1d4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "crachat_de_seve_noire",
    "nom": "Crachat de Sève noire",
    "type": "arme",
    "degats": "1d6",
    "portee": "courte (6m)",
    "typedegats": "magique (Chaos corrompu)"
  },
  {
    "id": "morsure",
    "nom": "Morsure",
    "type": "arme",
    "degats": "1d6+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "plaquage",
    "nom": "Plaquage",
    "type": "arme",
    "degats": "1d4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "charge",
    "nom": "Charge",
    "type": "arme",
    "degats": "2d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "defenses",
    "nom": "Défenses",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "toucher_glacial",
    "nom": "Toucher glacial",
    "type": "arme",
    "degats": "1d6",
    "portee": "contact",
    "typedegats": "magique (froid)"
  },
  {
    "id": "hurlement_du_vide",
    "nom": "Hurlement du vide",
    "type": "arme",
    "degats": "1d4",
    "portee": "courte (6m)",
    "typedegats": "magique (mental)"
  },
  {
    "id": "fouet_de_racine",
    "nom": "Fouet de racine",
    "type": "arme",
    "degats": "1d8",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "emprise",
    "nom": "Emprise",
    "type": "arme",
    "degats": "1d4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "hache_de_guerre",
    "nom": "Hache de guerre",
    "type": "arme",
    "degats": "1d8+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lancer_de_hache",
    "nom": "Lancer de hache",
    "type": "arme",
    "degats": "1d8+1",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "liane_de_corruption",
    "nom": "Liane de corruption",
    "type": "arme",
    "degats": "1d10+2",
    "portee": "courte (6m)",
    "typedegats": "magique (Chaos végétal)"
  },
  {
    "id": "explosion_de_spores",
    "nom": "Explosion de spores",
    "type": "arme",
    "degats": "2d6",
    "portee": "courte (6m)",
    "typedegats": "magique (Chaos végétal)"
  },
  {
    "id": "epee_longue_solaire",
    "nom": "Épée longue solaire",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "bouclier_frappe",
    "nom": "Bouclier-frappe",
    "type": "arme",
    "degats": "1d4+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "poing_de_granit",
    "nom": "Poing de granit",
    "type": "arme",
    "degats": "2d8+4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "pietinement",
    "nom": "Piétinement",
    "type": "arme",
    "degats": "2d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lame_d_ombre",
    "nom": "Lame d'ombre",
    "type": "arme",
    "degats": "1d6+2",
    "portee": "contact",
    "typedegats": "physique + magique"
  },
  {
    "id": "fleche_de_seve_noire",
    "nom": "Flèche de Sève noire",
    "type": "arme",
    "degats": "1d8",
    "portee": "longue (36m)",
    "typedegats": "magique (Chaos)"
  },
  {
    "id": "morsure_2",
    "nom": "Morsure",
    "type": "arme",
    "degats": "1d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "morsure_empoisonnee",
    "nom": "Morsure empoisonnée",
    "type": "arme",
    "degats": "1d6+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "plaquage_2",
    "nom": "Plaquage",
    "type": "arme",
    "degats": "1d4+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "morsure_dechirante",
    "nom": "Morsure déchirante",
    "type": "arme",
    "degats": "2d6+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "plaquage_brutal",
    "nom": "Plaquage brutal",
    "type": "arme",
    "degats": "1d6+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "griffes",
    "nom": "Griffes",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "morsure_3",
    "nom": "Morsure",
    "type": "arme",
    "degats": "1d6+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "griffes_lacerantes",
    "nom": "Griffes lacérantes",
    "type": "arme",
    "degats": "1d8+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "etreinte",
    "nom": "Étreinte",
    "type": "arme",
    "degats": "1d6+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "griffes_de_guerre",
    "nom": "Griffes de guerre",
    "type": "arme",
    "degats": "2d6+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "etreinte_ecrasante",
    "nom": "Étreinte écrasante",
    "type": "arme",
    "degats": "1d8+4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "charge_belier",
    "nom": "Charge bélier",
    "type": "arme",
    "degats": "2d8",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "griffes_devastatrices",
    "nom": "Griffes dévastatrices",
    "type": "arme",
    "degats": "2d8+5",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "morsure_broyante",
    "nom": "Morsure broyante",
    "type": "arme",
    "degats": "2d6+5",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "devastation_voie_puissance_r_3",
    "nom": "Dévastation (Voie Puissance r.3)",
    "type": "arme",
    "degats": "2d6+5",
    "portee": "contact (zone adjacente)",
    "typedegats": "physique"
  },
  {
    "id": "hache",
    "nom": "Hache",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lancer_de_hache_2",
    "nom": "Lancer de hache",
    "type": "arme",
    "degats": "1d8",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "hache_de_guerre_2",
    "nom": "Hache de guerre",
    "type": "arme",
    "degats": "1d10+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "bouclier_frappe_2",
    "nom": "Bouclier-frappe",
    "type": "arme",
    "degats": "1d4+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "hache_double",
    "nom": "Hache double",
    "type": "arme",
    "degats": "1d12+4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "double_frappe_voie_des_armes_r_3",
    "nom": "Double frappe (Voie des Armes r.3)",
    "type": "arme",
    "degats": "1d12+4 (x2)",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "masse_de_guerre_runique",
    "nom": "Masse de guerre runique",
    "type": "arme",
    "degats": "2d8+5",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "double_frappe",
    "nom": "Double frappe",
    "type": "arme",
    "degats": "2d8+5 (x2)",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "epee_courte",
    "nom": "Épée courte",
    "type": "arme",
    "degats": "1d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "arc_court",
    "nom": "Arc court",
    "type": "arme",
    "degats": "1d6",
    "portee": "moyenne (18m)",
    "typedegats": "physique"
  },
  {
    "id": "epee_batarde",
    "nom": "Épée bâtarde",
    "type": "arme",
    "degats": "1d8+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "dague_dans_le_dos",
    "nom": "Dague dans le dos",
    "type": "arme",
    "degats": "1d4+1d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "sabre_de_capitaine",
    "nom": "Sabre de capitaine",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "pistolet_d_arcon",
    "nom": "Pistolet d'arçon",
    "type": "arme",
    "degats": "1d10",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "attaque_sournoise",
    "nom": "Attaque sournoise",
    "type": "arme",
    "degats": "1d8+2+2d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "epee_longue_enchantee_1",
    "nom": "Épée longue enchantée +1",
    "type": "arme",
    "degats": "1d8+4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "double_frappe_2",
    "nom": "Double frappe",
    "type": "arme",
    "degats": "1d8+4 (x2)",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "riposte_voie_du_duel_r_2",
    "nom": "Riposte (Voie du Duel r.2)",
    "type": "arme",
    "degats": "1d8+4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "pistolets_jumeles",
    "nom": "Pistolets jumelés",
    "type": "arme",
    "degats": "1d10 (x2)",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "epee_courte_2",
    "nom": "Épée courte",
    "type": "arme",
    "degats": "1d6+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "arbalete_legere",
    "nom": "Arbalète légère",
    "type": "arme",
    "degats": "1d8",
    "portee": "moyenne (18m)",
    "typedegats": "physique"
  },
  {
    "id": "epee_longue",
    "nom": "Épée longue",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "epee_longue_de_maitre",
    "nom": "Épée longue de maître",
    "type": "arme",
    "degats": "1d8+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "bouclier_heraldique",
    "nom": "Bouclier héraldique",
    "type": "arme",
    "degats": "1d6+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "epee_de_la_couronne_enchantee_2",
    "nom": "Épée de la Couronne (enchantée +2)",
    "type": "arme",
    "degats": "1d8+5",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lance",
    "nom": "Lance",
    "type": "arme",
    "degats": "1d8+1",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "dague_de_ceinture",
    "nom": "Dague de ceinture",
    "type": "arme",
    "degats": "1d4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lance_de_guerre",
    "nom": "Lance de guerre",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "frappe_de_hampe",
    "nom": "Frappe de hampe",
    "type": "arme",
    "degats": "1d4+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lance_longue_renforcee",
    "nom": "Lance longue renforcée",
    "type": "arme",
    "degats": "1d10+3",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "frappe_de_hampe_lourde",
    "nom": "Frappe de hampe lourde",
    "type": "arme",
    "degats": "1d6+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lance_de_primus_enchantee_1",
    "nom": "Lance de primus (enchantée +1)",
    "type": "arme",
    "degats": "1d10+4",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "balayage_de_hampe",
    "nom": "Balayage de hampe",
    "type": "arme",
    "degats": "1d6+3",
    "portee": "contact (arc frontal)",
    "typedegats": "physique"
  },
  {
    "id": "pique_improvisee",
    "nom": "Pique improvisée",
    "type": "arme",
    "degats": "1d8",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "couteau",
    "nom": "Couteau",
    "type": "arme",
    "degats": "1d4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "lance_de_chasse",
    "nom": "Lance de chasse",
    "type": "arme",
    "degats": "1d8+1",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "lance_jetee",
    "nom": "Lance jetée",
    "type": "arme",
    "degats": "1d8+1",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "couteau_de_chasse",
    "nom": "Couteau de chasse",
    "type": "arme",
    "degats": "1d4+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "fauchard_de_bande",
    "nom": "Fauchard de bande",
    "type": "arme",
    "degats": "1d10+2",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "balayage_bas",
    "nom": "Balayage bas",
    "type": "arme",
    "degats": "1d6+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "hallebarde_de_guerre",
    "nom": "Hallebarde de guerre",
    "type": "arme",
    "degats": "1d12+3",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "double_frappe_voie_des_armes_r_3_2",
    "nom": "Double frappe (Voie des Armes r.3)",
    "type": "arme",
    "degats": "1d12+3 (x2)",
    "portee": "contact +1 case (3m)",
    "typedegats": "physique"
  },
  {
    "id": "riposte_voie_du_duel_r_2_2",
    "nom": "Riposte (Voie du Duel r.2)",
    "type": "arme",
    "degats": "1d12+3",
    "portee": "contact +1 case",
    "typedegats": "physique"
  },
  {
    "id": "epee_de_jugement",
    "nom": "Épée de jugement",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "epee_de_jugement_benie",
    "nom": "Épée de jugement (bénie)",
    "type": "arme",
    "degats": "1d8+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "jugement",
    "nom": "Jugement",
    "type": "arme",
    "degats": "2d8",
    "portee": "courte (6m)",
    "typedegats": "magique (sacré)"
  },
  {
    "id": "epee_du_concile_enchantee_2",
    "nom": "Épée du Concile (enchantée +2)",
    "type": "arme",
    "degats": "1d8+5",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "bucher_purificateur",
    "nom": "Bûcher purificateur",
    "type": "arme",
    "degats": "3d6",
    "portee": "moyenne (18m)",
    "typedegats": "magique (feu sacré)"
  },
  {
    "id": "baton_beni",
    "nom": "Bâton béni",
    "type": "arme",
    "degats": "1d4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "baton_beni_renforce",
    "nom": "Bâton béni (renforcé)",
    "type": "arme",
    "degats": "1d6+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "epee_du_serment",
    "nom": "Épée du serment",
    "type": "arme",
    "degats": "1d8+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "bouclier_du_pont",
    "nom": "Bouclier du Pont",
    "type": "arme",
    "degats": "1d4+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "epee_du_serment_heritage_de_l_ordre",
    "nom": "Épée du Serment (héritage de l'Ordre)",
    "type": "arme",
    "degats": "1d8+4",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "hache_a_deux_mains_trop_grande_pour_lui",
    "nom": "Hache à deux mains (trop grande pour lui)",
    "type": "arme",
    "degats": "1d8+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "hache_a_deux_mains",
    "nom": "Hache à deux mains",
    "type": "arme",
    "degats": "1d10+3",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "hache_a_deux_mains_2",
    "nom": "Hache à deux mains",
    "type": "arme",
    "degats": "1d10+2",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "squelette_lame_ebrechee",
    "nom": "Lame ébréchée",
    "type": "arme",
    "degats": "1d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "squelette_estoc_rouille",
    "nom": "Estoc rouillé",
    "type": "arme",
    "degats": "1d8+1",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "ossuaire_fauchage",
    "nom": "Fauchage d'os",
    "type": "arme",
    "degats": "2d6",
    "portee": "contact",
    "typedegats": "physique"
  },
  {
    "id": "ossuaire_esquilles",
    "nom": "Projection d'esquilles",
    "type": "arme",
    "degats": "1d8",
    "portee": "courte (6m)",
    "typedegats": "physique"
  },
  {
    "id": "connetable_lame",
    "nom": "Lame du serment brisé",
    "type": "arme",
    "degats": "1d10+3",
    "portee": "contact",
    "typedegats": "physique"
  }
];

const ArmesMonstres = (() => {
  "use strict";
  function trouver(armeId) {
    return ARMES_MONSTRES.find((a) => a.id === armeId) || null;
  }
  return { LISTE: ARMES_MONSTRES, trouver };
})();

if (typeof window !== "undefined") {
  window.ARMES_MONSTRES = ARMES_MONSTRES;
  window.ArmesMonstres = ArmesMonstres;
}
