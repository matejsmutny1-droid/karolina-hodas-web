# Firebase setup (Spark / bez Cloud Functions)

Rezervačný systém používa Firestore priamo z webu s bezpečnostnými pravidlami. Projekt zostáva na bezplatnom pláne Spark; Cloud Functions ani fakturačný účet nie sú potrebné.

## Jednorazové nastavenie

1. Vo Firebase Console otvor projekt **Kara Masaze** a v **Authentication → Sign-in method** povoľ **Email/Password**.
2. V **Authentication → Users** vytvor účty `karolinahodas@gmail.com` a `matejsmutny1@gmail.com`.
3. V **Authentication → Settings → Authorized domains** skontroluj `karamasaze.sk` (a prípadne `www.karamasaze.sk`).
4. Otvor **Firestore Database → Rules**, nahraď pravidlá obsahom súboru `firestore.rules` a klikni **Publish**. Pôvodné otvorené pravidlá už neobnovuj.
5. Publikuj webové súbory `index.html` a `admin.html` cez GitHub Pages.
6. Po nasadení otvor `https://karamasaze.sk/admin.html`, prihlás sa povoleným účtom a klikni na odkaz na overenie e-mailu. Po overení sa prihlás znova.

Pri prvom úspešnom prihlásení administrácia vytvorí katalóg služieb a presunie existujúce údaje zo starej kolekcie `terminy`: dostupnosť do verejnej kolekcie `dostupnost`, osobné údaje do `rezervacie` a anonymné časové bloky do `rezervacneZamky`. Po migrácii sa staré dokumenty `terminy` odstránia.

## Rozdelenie prístupov

- Verejnosť číta len dostupné okná, anonymné bloky a katalóg masáží.
- Klient vytvorí rezerváciu a súvisiace časové bloky v jednej Firestore transakcii. Pravidlá overujú službu, cenu, dĺžku, prestávku aj dostupnosť okna.
- Osobné údaje v `rezervacie` môžu čítať len overené účty `karolinahodas@gmail.com` a `matejsmutny1@gmail.com`.
- Administrácia upravuje termíny po prihlásení cez Firebase Authentication.

Firestore na Spark má limity bezplatného používania. Bez prepojeného fakturačného účtu sa nadlimitné operácie spoplatnením nezmenia; môžu sa však dočasne zastaviť, kým sa limit neobnoví.
