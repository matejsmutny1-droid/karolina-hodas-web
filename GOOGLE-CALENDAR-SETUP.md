# Automatický zápis rezervácií do Google Kalendára

Synchronizácia používa bezplatný Google Apps Script, ktorý každých 15 minút skontroluje budúce rezervácie vo Firestore a zosúladí ich s predvoleným kalendárom účtu `karolinahodas@gmail.com`. Nepotrebuje Firebase Cloud Functions ani fakturačný účet. Pri zrušení rezervácie odstráni príslušnú budúcu udalosť; po uskutočnení termínu udalosť ponechá v kalendári ako históriu. Úprava rezervácie sa premietne do existujúcej udalosti.

Skript vytvára súkromné udalosti. Obsahujú meno klienta a telefón, názov masáže, doplnky, cenu a čas vrátane prestávky. E-mail klienta do kalendára nekopíruje. Skript nepozýva klientov na udalosti.

## Jednorazové nastavenie v Kajkinom účte

1. Prihlásiť sa do [Google Apps Script](https://script.google.com/) ako `karolinahodas@gmail.com` a vytvoriť nový samostatný projekt, napríklad **KARA – synchronizácia rezervácií**.
2. Otvoriť súbor `Code.gs` v tomto priečinku a skopírovať jeho obsah do editora Apps Scriptu.
3. V editore otvoriť **Project Settings**, zapnúť zobrazenie súboru manifestu `appsscript.json` a nahradiť jeho obsah súborom `appsscript.json` z tohto priečinka.
4. V hornej lište vybrať funkciu `syncKaraBookings` a kliknúť **Run**. Pri prvom spustení Google zobrazí oprávnenia na úpravu kalendára a čítanie databázy; potvrdiť ich v Kajkinom účte.
5. Ak prvé spustenie skončí chybou `Firestore read failed (403)`, v Google Cloud Console projektu **kara-masaze** otvoriť **IAM & Admin → IAM** a účtu `karolinahodas@gmail.com` pridať rolu **Cloud Datastore Viewer**. Je to iba čítacie oprávnenie potrebné na získanie rezervácií. Potom znovu ručne spustiť `syncKaraBookings`.
6. Keď ručné spustenie prejde bez chyby, vybrať `installKaraCalendarTrigger` a kliknúť **Run**. Tým sa nainštaluje automatická kontrola každých 15 minút. Google môže znovu požiadať o potvrdenie oprávnení.
7. Skontrolovať predvolený kalendár účtu `karolinahodas@gmail.com`; budúce rezervácie sa v ňom zobrazia ako súkromné udalosti.

## Správa synchronizácie

- Akcia **Run → `syncKaraBookings`** spustí synchronizáciu hneď.
- Akcia **Run → `removeKaraCalendarTrigger`** zastaví automatické spúšťanie. Už zapísané udalosti ponechá v kalendári.
- Priebeh a prípadné chyby sú v Apps Scripte v časti **Executions**.

Skript sa spúšťa ako účet, ktorý vytvoril časový trigger, preto projekt vytvorte a trigger nainštalujte priamo v Kajkinom Google účte. [Dokumentácia Apps Scriptu](https://developers.google.com/apps-script/guides/triggers/installable) uvádza, že časové triggery bežia pod účtom svojho tvorcu. Skript číta Firestore cez [oficiálne REST API](https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/runQuery) a zapisuje udalosti cez [Calendar službu Apps Scriptu](https://developers.google.com/apps-script/reference/calendar).
