import { getSetting, setSetting, deleteSetting } from './db';

const BACKUP_SHEET_NAME = 'Shop_Daily_Register_Backup';

export interface GoogleUser {
  name: string;
  email: string;
  photoUrl?: string;
}

/**
 * Check if user is logged into Google
 */
export function isGoogleConnected(): boolean {
  return !!getSetting('google_access_token');
}

/**
 * Disconnect Google Sign-In
 */
export function disconnectGoogle(): void {
  deleteSetting('google_access_token');
  deleteSetting('google_user_name');
  deleteSetting('google_user_email');
  deleteSetting('google_spreadsheet_id');
}

/**
 * Get stored Google user details
 */
export function getGoogleUser(): GoogleUser | null {
  const email = getSetting('google_user_email');
  if (!email) return null;
  return {
    name: getSetting('google_user_name') || 'Google User',
    email,
  };
}

/**
 * Search Google Drive for 'Shop_Daily_Register_Backup' and return its Spreadsheet ID.
 * If not found, create it and set up the header row.
 */
export async function getOrCreateBackupSpreadsheet(accessToken: string): Promise<string> {
  // First, check if spreadsheet ID is already cached in settings
  const cachedId = getSetting('google_spreadsheet_id');
  if (cachedId) {
    return cachedId;
  }

  try {
    // 1. Search for the file in Google Drive
    const query = encodeURIComponent(`name='${BACKUP_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!searchResponse.ok) {
      throw new Error(`Drive search failed: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      const fileId = searchData.files[0].id;
      setSetting('google_spreadsheet_id', fileId);
      return fileId;
    }

    // 2. Not found, so create a new Spreadsheet
    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: BACKUP_SHEET_NAME,
        },
        sheets: [
          {
            properties: {
              title: 'Daily Registers',
            },
          },
        ],
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Spreadsheet creation failed: ${createResponse.statusText}`);
    }

    const createData = await createResponse.json();
    const spreadsheetId = createData.spreadsheetId;

    // 3. Populate headers in the new spreadsheet
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Daily Registers'!A1:H1:append?valueInputOption=USER_ENTERED`;
    const appendResponse = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: "'Daily Registers'!A1:H1",
        majorDimension: 'ROWS',
        values: [
          [
            'Date',
            'Total Expenses',
            'Actual Cash found',
            'Expected Revenue',
            'Gross Profit',
            'Net Profit',
            'Discrepancy',
            'Sync Date'
          ],
        ],
      }),
    });

    if (!appendResponse.ok) {
      console.warn('Failed to append headers, spreadsheet created but headers missing.');
    }

    setSetting('google_spreadsheet_id', spreadsheetId);
    return spreadsheetId;
  } catch (error) {
    console.error('Error in getOrCreateBackupSpreadsheet:', error);
    throw error;
  }
}

/**
 * Append or update daily register row in the Google Spreadsheet
 */
export async function syncRegisterToGoogle(
  registerData: {
    date: string;
    expenses: number;
    actual_cash: number;
    expected_revenue: number;
    gross_profit: number;
    net_profit: number;
    discrepancy: number;
  }
): Promise<boolean> {
  const accessToken = getSetting('google_access_token');
  if (!accessToken) {
    console.log('Sync skipped: No Google Access Token');
    return false;
  }

  try {
    const spreadsheetId = await getOrCreateBackupSpreadsheet(accessToken);
    
    // Append the row
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Daily Registers'!A:H:append?valueInputOption=USER_ENTERED`;
    const response = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: "'Daily Registers'!A:H",
        majorDimension: 'ROWS',
        values: [
          [
            registerData.date,
            registerData.expenses,
            registerData.actual_cash,
            registerData.expected_revenue,
            registerData.gross_profit,
            registerData.net_profit,
            registerData.discrepancy,
            new Date().toLocaleString()
          ],
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Sync API append call failed: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to sync register to Google Sheets:', error);
    return false; // Fail gracefully
  }
}
