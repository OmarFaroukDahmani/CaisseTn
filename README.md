# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## POS workflows

The POS, ingredient inventory, and analytics tabs use the local SQLite database initialized at app startup. Existing products can be sold from the POS once a shift is opened with a starting cash float. Checkout supports cash, card, mobile, delivery-app, and split payments; cash payouts and safe drops are recorded against the shift.

Use the Ingredients tab to maintain purchase-box costs, unit counts, current stock, low-stock thresholds, and product recipes. Completed orders deduct recipe quantities in the same database transaction as the order and payment records. The Z-Report tab summarizes a selected date and can share CSV or PDF exports. Set an order tax percentage at checkout when applicable; the initial rate is 0%.


### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)
