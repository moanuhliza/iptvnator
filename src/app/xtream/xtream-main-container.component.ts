import { JsonPipe, KeyValuePipe, NgFor, NgIf, NgSwitch } from '@angular/common';
import { Component, NgZone, OnInit, effect, inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Store } from '@ngrx/store';
import { IpcCommand } from '../../../shared/ipc-command.class';
import {
    ERROR,
    OPEN_MPV_PLAYER,
    XTREAM_REQUEST,
    XTREAM_RESPONSE,
} from '../../../shared/ipc-commands';
import { XtreamCategory } from '../../../shared/xtream-category.interface';
import { XtreamCodeActions } from '../../../shared/xtream-code-actions';
import { XtreamLiveStream } from '../../../shared/xtream-live-stream.interface';
import { XtreamResponse } from '../../../shared/xtream-response.interface';
import { XtreamVodDetails } from '../../../shared/xtream-vod-details.interface';
import { DataService } from '../services/data.service';
import { selectCurrentPlaylist } from '../state/selectors';
import { CategoryContentViewComponent } from './category-content-view/category-content-view.component';
import { CategoryViewComponent } from './category-view/category-view.component';
import { ContentType } from './content-type.enum';
import { NavigationBarComponent } from './navigation-bar/navigation-bar.component';
import { PlayerViewComponent } from './player-view/player-view.component';
import { VodDetailsComponent } from './vod-details/vod-details.component';

import { XtreamSerieDetails } from '../../../shared/xtream-serie-details.interface';
import { SerialDetailsComponent } from './serial-details/serial-details.component';

const ContentTypes = {
    LIVE_STREAMS: {
        title: 'Live streams',
        getContentAction: XtreamCodeActions.GetLiveStreams,
        getCategoryAction: XtreamCodeActions.GetLiveCategories,
    },
    VODS: {
        title: 'VOD streams',
        getContentAction: XtreamCodeActions.GetVodStreams,
        getCategoryAction: XtreamCodeActions.GetVodCategories,
        getDetailsAction: XtreamCodeActions.GetVodInfo,
    },
    SERIES: {
        title: 'Series',
        getContentAction: XtreamCodeActions.GetSeries,
        getCategoryAction: XtreamCodeActions.GetSeriesCategories,
        getDetailsAction: XtreamCodeActions.GetSeriesInfo,
    },
};

export interface Breadcrumb {
    action: XtreamCodeActions;
    title: string;
    category_id?: string;
}

type LayoutView =
    | 'category'
    | 'category_content'
    | 'vod-details'
    | 'player'
    | 'serie-details';

@Component({
    selector: 'app-xtream-main-container',
    templateUrl: './xtream-main-container.component.html',
    styleUrls: ['./xtream-main-container.component.scss'],
    standalone: true,
    imports: [
        KeyValuePipe,
        MatButtonToggleModule,
        NgFor,
        NgIf,
        JsonPipe,
        CategoryViewComponent,
        NgSwitch,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        NavigationBarComponent,
        VodDetailsComponent,
        PlayerViewComponent,
        CategoryContentViewComponent,
        SerialDetailsComponent,
    ],
})
export class XtreamMainContainerComponent implements OnInit {
    dataService = inject(DataService);
    ngZone = inject(NgZone);
    snackBar = inject(MatSnackBar);
    store = inject(Store);
    currentPlaylist = this.store.selectSignal(selectCurrentPlaylist);

    breadcrumbs: Breadcrumb[] = [];
    items = [];
    listeners = [];
    selectedContentType = ContentType.VODS;
    currentLayout: LayoutView = 'category';
    vodDetails!: XtreamVodDetails | XtreamSerieDetails;

    commandsList = [
        new IpcCommand(XTREAM_RESPONSE, (response: XtreamResponse) =>
            this.handleResponse(response)
        ),
        new IpcCommand(ERROR, (response: { message: string; status: number }) =>
            this.showErrorAsNotification(response)
        ),
    ];

    constructor() {
        effect(() => {
            if (this.currentPlaylist()) {
                this.getCategories(this.selectedContentType);
            }
        });
    }

    ngOnInit() {
        this.setInitialBreadcrumb();

        this.commandsList.forEach((command) => {
            if (this.dataService.isElectron) {
                this.dataService.listenOn(command.id, (_event, response) =>
                    this.ngZone.run(() => command.callback(response))
                );
            } else {
                const cb = (response) => {
                    if (response.data.type === command.id) {
                        command.callback(response.data);
                    }
                };
                this.dataService.listenOn(command.id, cb);
                this.listeners.push(cb);
            }
        });
    }

    handleResponse(response: XtreamResponse) {
        console.log(response.payload);
        switch (response.action) {
            case XtreamCodeActions.GetSeriesCategories:
            case XtreamCodeActions.GetVodCategories:
            case XtreamCodeActions.GetLiveCategories:
            case XtreamCodeActions.GetVodStreams:
            case XtreamCodeActions.GetLiveStreams:
            case XtreamCodeActions.GetSeries:
                this.items = response.payload as unknown[];
                break;
            case XtreamCodeActions.GetVodInfo:
                this.currentLayout = 'vod-details';
                this.vodDetails = response.payload as XtreamVodDetails;
                break;
            case XtreamCodeActions.GetSeriesInfo:
                this.currentLayout = 'serie-details';
                this.vodDetails = response.payload as XtreamSerieDetails;
                break;
            default:
                break;
        }
    }

    getCategories(contentType: ContentType = this.selectedContentType) {
        this.currentLayout = 'category';
        const action = ContentTypes[contentType].getCategoryAction;
        this.setInitialBreadcrumb(action);
        this.sendRequest({ action });
    }

    // TODO: MAKE IT ABSTRACT SOMEHOW
    ngOnDestroy(): void {
        if (this.dataService.isElectron) {
            this.commandsList.forEach((command) =>
                this.dataService.removeAllListeners(command.id)
            );
        } else {
            this.listeners.forEach((listener) => {
                window.removeEventListener('message', listener);
            });
        }
    }

    setInitialBreadcrumb(action = XtreamCodeActions.GetVodCategories) {
        this.breadcrumbs = [{ title: 'All categories', action }];
    }

    categoryClicked(item: XtreamCategory) {
        this.items = [];
        const action = ContentTypes[this.selectedContentType].getContentAction;
        this.breadcrumbs.push({
            title: item.category_name,
            category_id: item.category_id,
            action,
        });
        this.sendRequest({ action, category_id: item.category_id });
        this.currentLayout = 'category_content';
    }

    itemClicked(
        item: any /* XtreamLiveStream | XtreamVodStream | XtreamSerieItem */
    ) {
        let action;

        this.items = [];
        if (item.stream_type && item.stream_type === 'movie') {
            action = XtreamCodeActions.GetVodInfo;
            this.breadcrumbs.push({ title: item.name, action });
            this.sendRequest({ action, vod_id: item.stream_id });
        } else if (item.stream_type && item.stream_type === 'live') {
            this.breadcrumbs.push({
                title: item.name,
                action: XtreamCodeActions.GetLiveStreams,
            });
            this.playStream(item);
        } else if (item.series_id) {
            action = XtreamCodeActions.GetSeriesInfo;
            this.breadcrumbs.push({ title: item.name, action });
            this.sendRequest({ action, series_id: item.series_id });
        }
    }

    playStream(item: XtreamLiveStream) {
        this.currentLayout = 'player';
        const { serverUrl, username, password } = this.currentPlaylist();

        const streamUrl = `${serverUrl}/${item.stream_type}/${username}/${password}/${item.stream_id}.ts`;

        this.dataService.sendIpcEvent(OPEN_MPV_PLAYER, {
            url: streamUrl,
        });
    }

    playVod() {
        this.currentLayout = 'player';
        const { serverUrl, username, password } = this.currentPlaylist();

        this.items = [];
        const streamUrl = `${serverUrl}/movie/${username}/${password}/${
            (this.vodDetails as XtreamVodDetails).movie_data.stream_id
        }.${
            (this.vodDetails as XtreamVodDetails).movie_data.container_extension
        }`;

        this.dataService.sendIpcEvent(OPEN_MPV_PLAYER, {
            url: streamUrl,
        });
    }

    changeContentType(contentType: ContentType) {
        this.selectedContentType = contentType;
        this.getCategories();
    }

    showErrorAsNotification(response: { message: string; status: number }) {
        this.snackBar.open(
            `Error: ${response?.message ?? 'Something went wrong'} (Status: ${
                response?.status ?? 0
            })`,
            null,
            { duration: 4000 }
        );
    }

    /**
     * Should get the position of the clicked breadcrumb and remove all the items after
     * @param breadcrumb clicked breadcrumb item
     */
    breadcrumbClicked(breadcrumb: Breadcrumb) {
        this.items = [];
        const itemIndex = this.breadcrumbs.findIndex((i) => i === breadcrumb);

        // do nothing if last breadcrumb child was clicked
        if (itemIndex === this.breadcrumbs.length - 1) return;

        this.breadcrumbs.splice(
            itemIndex + 1,
            this.breadcrumbs.length - itemIndex - 1
        );
        this.currentLayout = this.getLayoutViewBasedOnAction(breadcrumb.action);
        this.sendRequest({
            action: breadcrumb.action,
            ...(breadcrumb.category_id
                ? { category_id: breadcrumb.category_id }
                : {}),
        });
    }

    getLayoutViewBasedOnAction(action: XtreamCodeActions) {
        let result: LayoutView = 'category';
        switch (action) {
            case XtreamCodeActions.GetLiveCategories:
            case XtreamCodeActions.GetVodCategories:
            case XtreamCodeActions.GetSeriesCategories:
                result = 'category';
                break;
            case XtreamCodeActions.GetLiveStreams:
            case XtreamCodeActions.GetVodStreams:
            case XtreamCodeActions.GetSeries:
                result = 'category_content';
                break;
            case XtreamCodeActions.GetVodInfo:
            case XtreamCodeActions.GetSeriesInfo:
                result = 'vod-details';
                break;
            default:
                console.error(`Error: Unknown action was provided: ${action}`);
                break;
        }

        return result;
    }

    sendRequest(params: Record<string, string | number>) {
        const { serverUrl, username, password } = this.currentPlaylist();
        this.dataService.sendIpcEvent(XTREAM_REQUEST, {
            url: serverUrl,
            params: {
                password,
                username,
                ...params,
            },
        });
    }
}
