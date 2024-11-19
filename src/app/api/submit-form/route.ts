import { google, sheets_v4 } from 'googleapis';
import { NextResponse } from 'next/server';
import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let auth: JWT | null = null;

async function initializeGoogleAuth() {
  try {
    const keyString = process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}';
    const keyFile = JSON.parse(keyString as string);

    auth = new google.auth.JWT({
      email: keyFile.client_email,
      key: keyFile.private_key,
      scopes: SCOPES,
    });
  } catch (error) {
    console.error('Error initializing GoogleAuth:', error);
    auth = null;
  }
}

initializeGoogleAuth();

let sheets: sheets_v4.Sheets | PromiseLike<sheets_v4.Sheets>

async function getSheets(): Promise<sheets_v4.Sheets> {
  if (!sheets) {
    try {
      if (!auth) {
        throw new Error('GoogleAuth not initialized');
      }
      console.log('Getting auth client...');
      await auth.authorize();
      console.log('Auth client authorized successfully');

      console.log('Initializing Google Sheets API...');
      sheets = google.sheets({ version: 'v4', auth });
      console.log('Google Sheets API initialized successfully');
    } catch (error) {
      console.error('Error in getSheets:', error);
      throw new Error('Failed to initialize Google Sheets API');
    }
  }
  return sheets;
}

const SHEET_IDS = {
  buy: '1GbuGCJMBioG3ZMRh-FkaGXMlfQXy18XZgCnp5M_P-D4',
  sell: '10VFNaWb3vDf-K4YKenMaVZBA20pzsEH8Hbrkag8E39M',
  rent: '1q88ckhUiTXdF_j41SLVWibru3KreVWuroo_MOUuxQ10'
} as const;

type FormValue = string | string[] | number | boolean | null | undefined;

function preprocessValue(value: FormValue): string {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).join('; ');
  }
  if (typeof value === 'string') {
    return value.replace(/\$/g, '').replace(/,/g, ' ').trim();
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

type FormData = {
  userType: keyof typeof SHEET_IDS;
  name: string;
  email: string;
  phoneNumber: string;
  budget?: string;
  typesOfHome?: string[];
  bedrooms?: string;
  bathrooms?: string;
  location?: string;
  moveInDuration?: string;
  preApproved?: string;
  underContract?: string;
  [key: string]: FormValue;
}

export async function POST(req: Request) {
  console.log('Received form submission request');

  try {
    const body = await req.json() as FormData;
    console.log('Received form data:', JSON.stringify(body, null, 2));

    console.log('Getting Sheets API...');
    const sheets = await getSheets();
    console.log('Sheets API obtained successfully');

    const {
      userType,
      name,
      email,
      phoneNumber,
      budget,
      typesOfHome,
      bedrooms,
      bathrooms,
      location,
      moveInDuration,
      preApproved,
      underContract,
      ...otherData
    } = body;

    if (!userType || !SHEET_IDS[userType]) {
      throw new Error('Invalid or missing user type');
    }

    const sheetId = SHEET_IDS[userType];

    const values = [
      [
        new Date().toISOString(),
        preprocessValue(name),
        preprocessValue(email),
        preprocessValue(phoneNumber),
        preprocessValue(budget),
        preprocessValue(typesOfHome),
        preprocessValue(bedrooms),
        preprocessValue(bathrooms),
        preprocessValue(location),
        preprocessValue(moveInDuration),
        preprocessValue(preApproved),
        preprocessValue(underContract),
        ...Object.values(otherData).map(preprocessValue)
      ],
    ];

    console.log(`Appending data to Google Sheet for ${userType}...`);
    console.log('Preprocessed values:', JSON.stringify(values, null, 2));

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'A2',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    console.log(`Data successfully appended to Google Sheet for ${userType}`);
    return NextResponse.json({ success: true, data: response.data });

  } catch (error: unknown) {
    console.error('Error in form submission:', error);

    let errorMessage = 'An unexpected error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.error('Detailed error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}